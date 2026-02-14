-- ============================================
-- Postgres Functions (SECURITY DEFINER)
-- ============================================

-- ============================================
-- verify_qr_code: Approve user via QR scan
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_qr_code(
  p_user_id uuid,
  p_code_hash text
)
RETURNS boolean AS $$
DECLARE
  v_code_id uuid;
BEGIN
  -- Find unused matching code with row lock
  SELECT id INTO v_code_id
  FROM public.approved_codes
  WHERE code_hash = p_code_hash
    AND is_used = false
  FOR UPDATE;

  IF v_code_id IS NULL THEN
    RETURN false;
  END IF;

  -- Mark code as used
  UPDATE public.approved_codes
  SET is_used = true, used_by = p_user_id, used_at = now()
  WHERE id = v_code_id;

  -- Approve user and grant 1000 leaves
  UPDATE public.profiles
  SET is_approved = true, balance = 1000
  WHERE id = p_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- create_market: Admin creates a new market
-- ============================================
CREATE OR REPLACE FUNCTION public.create_market(
  p_creator_id uuid,
  p_question text,
  p_description text,
  p_initial_prob numeric,
  p_ante numeric
)
RETURNS uuid AS $$
DECLARE
  v_market_id uuid;
  v_pool numeric;
BEGIN
  IF p_initial_prob <= 0 OR p_initial_prob >= 1 THEN
    RAISE EXCEPTION 'Initial probability must be between 0 and 1 exclusive';
  END IF;

  -- Pool starts with equal reserves; p parameter encodes the probability
  v_pool := p_ante / 2.0;

  INSERT INTO public.markets (
    question, description, creator_id,
    pool_yes, pool_no, p, probability,
    total_liquidity, volume, status
  ) VALUES (
    p_question, p_description, p_creator_id,
    v_pool, v_pool, p_initial_prob, p_initial_prob,
    p_ante, 0, 'active'
  )
  RETURNING id INTO v_market_id;

  -- Record initial probability point
  INSERT INTO public.probability_history (market_id, probability)
  VALUES (v_market_id, p_initial_prob);

  RETURN v_market_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- execute_trade: Atomic buy trade
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_trade(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_amount numeric
)
RETURNS jsonb AS $$
DECLARE
  v_pool_yes numeric;
  v_pool_no numeric;
  v_p numeric;
  v_k numeric;
  v_shares numeric;
  v_new_yes numeric;
  v_new_no numeric;
  v_new_prob numeric;
  v_prob_before numeric;
  v_balance numeric;
  v_status text;
BEGIN
  -- Validate inputs
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount must be positive';
  END IF;

  IF p_outcome NOT IN ('YES', 'NO') THEN
    RAISE EXCEPTION 'Outcome must be YES or NO';
  END IF;

  -- Lock and fetch user balance
  SELECT balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Lock and fetch market
  SELECT pool_yes, pool_no, p, probability, status
  INTO v_pool_yes, v_pool_no, v_p, v_prob_before, v_status
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF v_pool_yes IS NULL THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  -- Calculate invariant: k = y^p * n^(1-p)
  v_k := power(v_pool_yes, v_p) * power(v_pool_no, 1.0 - v_p);

  -- Calculate shares and new pool state
  IF p_outcome = 'YES' THEN
    v_new_no := v_pool_no + p_amount;
    v_new_yes := power(v_k / power(v_new_no, 1.0 - v_p), 1.0 / v_p);
    v_shares := v_pool_yes + p_amount - v_new_yes;
  ELSE
    v_new_yes := v_pool_yes + p_amount;
    v_new_no := power(v_k / power(v_new_yes, v_p), 1.0 / (1.0 - v_p));
    v_shares := v_pool_no + p_amount - v_new_no;
  END IF;

  IF v_shares <= 0 THEN
    RAISE EXCEPTION 'Trade produces no shares';
  END IF;

  -- Calculate new probability
  v_new_prob := (v_p * v_new_no) / ((1.0 - v_p) * v_new_yes + v_p * v_new_no);

  -- Deduct user balance
  UPDATE public.profiles
  SET balance = balance - p_amount
  WHERE id = p_user_id;

  -- Update market pool
  UPDATE public.markets
  SET pool_yes = v_new_yes,
      pool_no = v_new_no,
      probability = v_new_prob,
      volume = volume + p_amount
  WHERE id = p_market_id;

  -- Record the trade
  INSERT INTO public.trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after)
  VALUES (p_market_id, p_user_id, 'BUY', p_outcome, p_amount, v_shares, v_prob_before, v_new_prob);

  -- Upsert position
  INSERT INTO public.positions (user_id, market_id, yes_shares, no_shares, total_invested)
  VALUES (
    p_user_id,
    p_market_id,
    CASE WHEN p_outcome = 'YES' THEN v_shares ELSE 0 END,
    CASE WHEN p_outcome = 'NO' THEN v_shares ELSE 0 END,
    p_amount
  )
  ON CONFLICT (user_id, market_id) DO UPDATE SET
    yes_shares = positions.yes_shares + CASE WHEN p_outcome = 'YES' THEN v_shares ELSE 0 END,
    no_shares = positions.no_shares + CASE WHEN p_outcome = 'NO' THEN v_shares ELSE 0 END,
    total_invested = positions.total_invested + p_amount;

  -- Record probability history
  INSERT INTO public.probability_history (market_id, probability)
  VALUES (p_market_id, v_new_prob);

  RETURN jsonb_build_object(
    'shares', v_shares,
    'prob_before', v_prob_before,
    'prob_after', v_new_prob,
    'amount', p_amount,
    'outcome', p_outcome,
    'type', 'BUY'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- execute_sell: Atomic sell trade
-- Selling S YES = finding cost M to buy S NO, user gets S - M mana
-- ============================================
CREATE OR REPLACE FUNCTION public.execute_sell(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_shares numeric
)
RETURNS jsonb AS $$
DECLARE
  v_pool_yes numeric;
  v_pool_no numeric;
  v_p numeric;
  v_k numeric;
  v_prob_before numeric;
  v_status text;
  v_user_yes_shares numeric;
  v_user_no_shares numeric;
  v_lo numeric;
  v_hi numeric;
  v_mid numeric;
  v_test_shares numeric;
  v_cost_m numeric;
  v_payout numeric;
  v_new_yes numeric;
  v_new_no numeric;
  v_new_prob numeric;
  v_opp_outcome text;
  i integer;
BEGIN
  -- Validate inputs
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Shares must be positive';
  END IF;

  IF p_outcome NOT IN ('YES', 'NO') THEN
    RAISE EXCEPTION 'Outcome must be YES or NO';
  END IF;

  v_opp_outcome := CASE WHEN p_outcome = 'YES' THEN 'NO' ELSE 'YES' END;

  -- Lock and fetch user position
  SELECT yes_shares, no_shares
  INTO v_user_yes_shares, v_user_no_shares
  FROM public.positions
  WHERE user_id = p_user_id AND market_id = p_market_id
  FOR UPDATE;

  IF v_user_yes_shares IS NULL THEN
    RAISE EXCEPTION 'No position in this market';
  END IF;

  IF p_outcome = 'YES' AND v_user_yes_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient YES shares';
  END IF;

  IF p_outcome = 'NO' AND v_user_no_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient NO shares';
  END IF;

  -- Lock and fetch market
  SELECT pool_yes, pool_no, p, probability, status
  INTO v_pool_yes, v_pool_no, v_p, v_prob_before, v_status
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF v_pool_yes IS NULL THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  -- Binary search for M: cost to buy p_shares of the opposite outcome
  v_lo := 0;
  v_hi := p_shares * 10;

  FOR i IN 1..100 LOOP
    v_mid := (v_lo + v_hi) / 2.0;

    -- Calculate how many shares of the opposite outcome M mana would buy
    v_k := power(v_pool_yes, v_p) * power(v_pool_no, 1.0 - v_p);

    IF v_opp_outcome = 'YES' THEN
      -- Buying YES: new_no = pool_no + mid, solve new_yes
      v_new_no := v_pool_no + v_mid;
      v_new_yes := power(v_k / power(v_new_no, 1.0 - v_p), 1.0 / v_p);
      v_test_shares := v_pool_yes + v_mid - v_new_yes;
    ELSE
      -- Buying NO: new_yes = pool_yes + mid, solve new_no
      v_new_yes := v_pool_yes + v_mid;
      v_new_no := power(v_k / power(v_new_yes, v_p), 1.0 / (1.0 - v_p));
      v_test_shares := v_pool_no + v_mid - v_new_no;
    END IF;

    IF abs(v_test_shares - p_shares) < 0.00000001 THEN
      EXIT;
    END IF;

    IF v_test_shares < p_shares THEN
      v_lo := v_mid;
    ELSE
      v_hi := v_mid;
    END IF;
  END LOOP;

  v_cost_m := (v_lo + v_hi) / 2.0;
  v_payout := p_shares - v_cost_m;

  IF v_payout <= 0 THEN
    RAISE EXCEPTION 'Sell would produce no payout';
  END IF;

  -- Now calculate final pool state: pool updates as if someone bought the opposite for cost_m
  v_k := power(v_pool_yes, v_p) * power(v_pool_no, 1.0 - v_p);

  IF v_opp_outcome = 'YES' THEN
    v_new_no := v_pool_no + v_cost_m;
    v_new_yes := power(v_k / power(v_new_no, 1.0 - v_p), 1.0 / v_p);
  ELSE
    v_new_yes := v_pool_yes + v_cost_m;
    v_new_no := power(v_k / power(v_new_yes, v_p), 1.0 / (1.0 - v_p));
  END IF;

  v_new_prob := (v_p * v_new_no) / ((1.0 - v_p) * v_new_yes + v_p * v_new_no);

  -- Credit user balance
  UPDATE public.profiles
  SET balance = balance + v_payout
  WHERE id = p_user_id;

  -- Update market pool
  UPDATE public.markets
  SET pool_yes = v_new_yes,
      pool_no = v_new_no,
      probability = v_new_prob,
      volume = volume + v_payout
  WHERE id = p_market_id;

  -- Record the trade
  INSERT INTO public.trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after)
  VALUES (p_market_id, p_user_id, 'SELL', p_outcome, v_payout, p_shares, v_prob_before, v_new_prob);

  -- Update position
  IF p_outcome = 'YES' THEN
    UPDATE public.positions
    SET yes_shares = yes_shares - p_shares
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    UPDATE public.positions
    SET no_shares = no_shares - p_shares
    WHERE user_id = p_user_id AND market_id = p_market_id;
  END IF;

  -- Record probability history
  INSERT INTO public.probability_history (market_id, probability)
  VALUES (p_market_id, v_new_prob);

  RETURN jsonb_build_object(
    'payout', v_payout,
    'shares_sold', p_shares,
    'prob_before', v_prob_before,
    'prob_after', v_new_prob,
    'outcome', p_outcome,
    'type', 'SELL'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- resolve_market: Resolve and pay out
-- ============================================
CREATE OR REPLACE FUNCTION public.resolve_market(
  p_market_id uuid,
  p_resolution text
)
RETURNS void AS $$
DECLARE
  v_position RECORD;
  v_payout numeric;
  v_resolution_value numeric;
BEGIN
  -- Mark market as resolved
  UPDATE public.markets
  SET status = 'resolved', resolution = p_resolution, resolved_at = now()
  WHERE id = p_market_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found or already resolved';
  END IF;

  -- Calculate and distribute payouts
  FOR v_position IN
    SELECT * FROM public.positions WHERE market_id = p_market_id
  LOOP
    IF p_resolution = 'YES' THEN
      v_payout := v_position.yes_shares;
    ELSIF p_resolution = 'NO' THEN
      v_payout := v_position.no_shares;
    ELSIF p_resolution = 'N/A' THEN
      v_payout := v_position.total_invested;
    ELSE
      -- Percentage resolution
      v_resolution_value := p_resolution::numeric;
      v_payout := v_position.yes_shares * v_resolution_value
                + v_position.no_shares * (1.0 - v_resolution_value);
    END IF;

    IF v_payout > 0 THEN
      UPDATE public.profiles
      SET balance = balance + v_payout
      WHERE id = v_position.user_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
