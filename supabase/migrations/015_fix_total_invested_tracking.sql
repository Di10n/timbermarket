-- ============================================
-- Migration 015: Fix total_invested to track true net cash flow
--
-- Previously, total_invested was floored at 0 during sell and
-- redemption updates via GREATEST(0, ...). This lost information
-- about realized trading profits, allowing users to profit from
-- N/A resolutions on markets where they had already extracted
-- more than they put in.
--
-- Fix: Allow total_invested to go negative (meaning the user has
-- extracted more than they invested). Floor at 0 only at N/A
-- resolution time, so users who already profited get no refund
-- while users still at risk get their net cost back.
-- ============================================

-- 1. Update execute_trade: remove GREATEST(0, ...) from auto-redemption
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
  v_redeemed numeric := 0;
  v_pos_yes numeric;
  v_pos_no numeric;
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

  -- Auto-redeem offsetting positions
  SELECT yes_shares, no_shares
  INTO v_pos_yes, v_pos_no
  FROM public.positions
  WHERE user_id = p_user_id AND market_id = p_market_id;

  v_redeemed := LEAST(v_pos_yes, v_pos_no);

  IF v_redeemed > 0 THEN
    UPDATE public.positions
    SET yes_shares = yes_shares - v_redeemed,
        no_shares = no_shares - v_redeemed,
        total_invested = total_invested - v_redeemed
    WHERE user_id = p_user_id AND market_id = p_market_id;

    UPDATE public.profiles
    SET balance = balance + v_redeemed
    WHERE id = p_user_id;

    INSERT INTO public.trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after)
    VALUES (p_market_id, p_user_id, 'REDEEM', p_outcome, v_redeemed, v_redeemed, v_new_prob, v_new_prob);
  END IF;

  -- Record probability history
  INSERT INTO public.probability_history (market_id, probability)
  VALUES (p_market_id, v_new_prob);

  RETURN jsonb_build_object(
    'shares', v_shares,
    'prob_before', v_prob_before,
    'prob_after', v_new_prob,
    'amount', p_amount,
    'outcome', p_outcome,
    'type', 'BUY',
    'redeemed', v_redeemed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update execute_sell: remove GREATEST(0, ...) from sell and auto-redemption
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
  v_actual_shares numeric;
  i integer;
  v_epsilon numeric := 0.000001;
  v_redeemed numeric := 0;
  v_pos_yes numeric;
  v_pos_no numeric;
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

  -- Clamp shares to available amount if within epsilon tolerance
  IF p_outcome = 'YES' THEN
    IF p_shares > v_user_yes_shares AND p_shares - v_user_yes_shares < v_epsilon THEN
      p_shares := v_user_yes_shares;
    END IF;
    IF v_user_yes_shares < p_shares THEN
      RAISE EXCEPTION 'Insufficient YES shares';
    END IF;
  ELSE
    IF p_shares > v_user_no_shares AND p_shares - v_user_no_shares < v_epsilon THEN
      p_shares := v_user_no_shares;
    END IF;
    IF v_user_no_shares < p_shares THEN
      RAISE EXCEPTION 'Insufficient NO shares';
    END IF;
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

  -- Update position: reduce shares AND track net cash flow (no floor)
  IF p_outcome = 'YES' THEN
    UPDATE public.positions
    SET yes_shares = yes_shares - p_shares,
        total_invested = total_invested - v_payout
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    UPDATE public.positions
    SET no_shares = no_shares - p_shares,
        total_invested = total_invested - v_payout
    WHERE user_id = p_user_id AND market_id = p_market_id;
  END IF;

  -- Auto-redeem offsetting positions (defensive)
  SELECT yes_shares, no_shares
  INTO v_pos_yes, v_pos_no
  FROM public.positions
  WHERE user_id = p_user_id AND market_id = p_market_id;

  v_redeemed := LEAST(v_pos_yes, v_pos_no);

  IF v_redeemed > 0 THEN
    UPDATE public.positions
    SET yes_shares = yes_shares - v_redeemed,
        no_shares = no_shares - v_redeemed,
        total_invested = total_invested - v_redeemed
    WHERE user_id = p_user_id AND market_id = p_market_id;

    UPDATE public.profiles
    SET balance = balance + v_redeemed
    WHERE id = p_user_id;

    INSERT INTO public.trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after)
    VALUES (p_market_id, p_user_id, 'REDEEM', p_outcome, v_redeemed, v_redeemed, v_new_prob, v_new_prob);
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
    'type', 'SELL',
    'redeemed', v_redeemed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update resolve_market: floor total_invested at payout time, not tracking time
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
      -- Floor at 0: users who already extracted more than they invested get nothing
      v_payout := GREATEST(0, v_position.total_invested);
    ELSE
      -- Percentage resolution
      v_resolution_value := p_resolution::numeric;
      IF v_resolution_value < 0 OR v_resolution_value > 1 THEN
        RAISE EXCEPTION 'Percentage resolution must be between 0 and 1';
      END IF;
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
