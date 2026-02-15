-- Fix FPMM sell algorithm
-- The previous implementation incorrectly used binary search on the BUY function
-- This fix properly reverses the buy operation by adding shares back and removing liquidity

-- Drop the broken calculate_fpmm_sell function
DROP FUNCTION IF EXISTS calculate_fpmm_sell(jsonb, numeric, text);

-- Create corrected sell calculation function
CREATE OR REPLACE FUNCTION calculate_fpmm_sell(
  p_pools jsonb,
  p_shares_to_sell numeric,
  p_outcome text
)
RETURNS TABLE(payout numeric, new_pools jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  v_outcomes text[];
  v_n integer;
  v_k numeric;
  v_new_pools jsonb;
  v_target_pool numeric;
  v_new_target_pool numeric;
  v_low numeric;
  v_high numeric;
  v_mid numeric;
  v_test_product numeric;
  v_target_product numeric;
  v_outcome text;
  v_iterations integer := 0;
  v_max_iterations integer := 100;
  v_epsilon numeric := 0.0001;
BEGIN
  -- Get all outcomes
  SELECT array_agg(key ORDER BY key) INTO v_outcomes
  FROM jsonb_object_keys(p_pools) AS key;

  v_n := array_length(v_outcomes, 1);

  -- Calculate current invariant k
  v_k := 1;
  FOREACH v_outcome IN ARRAY v_outcomes LOOP
    v_k := v_k * (p_pools->>v_outcome)::numeric;
  END LOOP;

  -- Add shares back to target pool
  v_target_pool := (p_pools->>p_outcome)::numeric;
  v_new_target_pool := v_target_pool + p_shares_to_sell;

  -- Calculate target product for non-target pools: k / new_target_pool
  v_target_product := v_k / v_new_target_pool;

  -- Binary search for payout amount P
  -- When we remove P/(N-1) from each non-target pool, product should equal target_product
  v_low := 0;
  v_high := v_target_pool * 10; -- Upper bound (generous)

  WHILE v_high - v_low > v_epsilon AND v_iterations < v_max_iterations LOOP
    v_mid := (v_low + v_high) / 2;

    -- Calculate product of (pool - mid/(N-1)) for all non-target pools
    v_test_product := 1;
    FOREACH v_outcome IN ARRAY v_outcomes LOOP
      IF v_outcome != p_outcome THEN
        v_test_product := v_test_product * ((p_pools->>v_outcome)::numeric - v_mid / (v_n - 1));
      END IF;
    END LOOP;

    IF abs(v_test_product - v_target_product) < v_epsilon THEN
      -- Found it
      EXIT;
    ELSIF v_test_product > v_target_product THEN
      -- Need to remove more
      v_low := v_mid;
    ELSE
      -- Removing too much
      v_high := v_mid;
    END IF;

    v_iterations := v_iterations + 1;
  END LOOP;

  -- Use final midpoint as payout
  payout := v_mid;

  -- Build new pools
  v_new_pools := jsonb_build_object();
  FOREACH v_outcome IN ARRAY v_outcomes LOOP
    IF v_outcome = p_outcome THEN
      v_new_pools := v_new_pools || jsonb_build_object(v_outcome, v_new_target_pool);
    ELSE
      v_new_pools := v_new_pools || jsonb_build_object(
        v_outcome,
        (p_pools->>v_outcome)::numeric - payout / (v_n - 1)
      );
    END IF;
  END LOOP;

  new_pools := v_new_pools;

  RETURN NEXT;
END;
$$;

-- Update execute_sell_multi to use corrected algorithm
CREATE OR REPLACE FUNCTION execute_sell_multi(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_shares numeric
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user record;
  v_market record;
  v_position record;
  v_current_shares numeric;
  v_prob_before numeric;
  v_prob_after numeric;
  v_payout numeric;
  v_new_pools jsonb;
  v_trade_id uuid;
BEGIN
  -- Lock user and market
  SELECT * INTO v_user FROM profiles WHERE id = p_user_id FOR UPDATE;
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF NOT (v_market.outcomes @> ARRAY[p_outcome]) THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  -- Get user position
  SELECT * INTO v_position FROM positions
  WHERE user_id = p_user_id AND market_id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No position found';
  END IF;

  -- Check user has enough shares
  v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);
  IF v_current_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient shares';
  END IF;

  -- Calculate probability before
  v_prob_before := (calculate_fpmm_probabilities(v_market.outcome_pools)->>p_outcome)::numeric;

  -- Calculate sell using corrected algorithm
  SELECT s.payout, s.new_pools INTO v_payout, v_new_pools
  FROM calculate_fpmm_sell(v_market.outcome_pools, p_shares, p_outcome) s;

  -- Validate payout is positive
  IF v_payout <= 0 THEN
    RAISE EXCEPTION 'Invalid payout calculated';
  END IF;

  -- Update market pools and volume
  UPDATE markets
  SET
    outcome_pools = v_new_pools,
    volume = volume + v_payout
  WHERE id = p_market_id;

  -- Update user balance
  UPDATE profiles
  SET balance = balance + v_payout
  WHERE id = p_user_id;

  -- Update position
  UPDATE positions
  SET shares_by_outcome = shares_by_outcome || jsonb_build_object(
    p_outcome,
    v_current_shares - p_shares
  )
  WHERE user_id = p_user_id AND market_id = p_market_id;

  -- Calculate probability after
  v_prob_after := (calculate_fpmm_probabilities(v_new_pools)->>p_outcome)::numeric;

  -- Record trade
  INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after)
  VALUES (p_market_id, p_user_id, 'SELL', p_outcome, v_payout, p_shares, v_prob_before, v_prob_after)
  RETURNING id INTO v_trade_id;

  -- Record probability history
  INSERT INTO probability_history (market_id, probability_distribution, created_at)
  VALUES (p_market_id, calculate_fpmm_probabilities(v_new_pools), now());

  RETURN jsonb_build_object(
    'success', true,
    'payout', v_payout,
    'new_balance', v_user.balance + v_payout,
    'trade_id', v_trade_id
  );
END;
$$;
