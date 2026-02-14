-- Fix floating-point rounding issue in execute_sell share validation
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
