-- Ensure all multi-resolution market functions exist
-- Drop existing functions first to avoid conflicts

DROP FUNCTION IF EXISTS calculate_fpmm_probabilities(jsonb);
DROP FUNCTION IF EXISTS calculate_fpmm_invariant(jsonb);
DROP FUNCTION IF EXISTS calculate_fpmm_buy(jsonb, numeric, text);
DROP FUNCTION IF EXISTS create_market_multi(uuid, text, text, text[], numeric);
DROP FUNCTION IF EXISTS execute_trade_multi(uuid, uuid, text, numeric);
DROP FUNCTION IF EXISTS execute_sell_multi(uuid, uuid, text, numeric);
DROP FUNCTION IF EXISTS resolve_market_multi(uuid, text);

-- Helper function: Calculate FPMM probabilities
CREATE OR REPLACE FUNCTION calculate_fpmm_probabilities(pools jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  outcome text;
  pool_value numeric;
  inverse_sum numeric := 0;
  inverse_map jsonb := '{}';
  result jsonb := '{}';
  prob numeric;
BEGIN
  -- Calculate sum of 1/qi
  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(pools)
  LOOP
    IF pool_value::numeric <= 0 THEN
      RAISE EXCEPTION 'Pool for % must be positive', outcome;
    END IF;
    inverse_sum := inverse_sum + (1.0 / pool_value::numeric);
    inverse_map := jsonb_set(inverse_map, ARRAY[outcome], to_jsonb(1.0 / pool_value::numeric));
  END LOOP;

  -- Calculate probabilities
  FOR outcome IN SELECT jsonb_object_keys(inverse_map)
  LOOP
    prob := (inverse_map->>outcome)::numeric / inverse_sum;
    result := jsonb_set(result, ARRAY[outcome], to_jsonb(prob));
  END LOOP;

  RETURN result;
END;
$$;

-- Helper function: Calculate FPMM invariant
CREATE OR REPLACE FUNCTION calculate_fpmm_invariant(pools jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k numeric := 1;
  pool_value numeric;
BEGIN
  FOR pool_value IN SELECT value::numeric FROM jsonb_each_text(pools)
  LOOP
    IF pool_value <= 0 THEN
      RAISE EXCEPTION 'All pools must be positive';
    END IF;
    k := k * pool_value;
  END LOOP;
  RETURN k;
END;
$$;

-- Helper function: Calculate buy shares using FPMM
CREATE OR REPLACE FUNCTION calculate_fpmm_buy(
  pools jsonb,
  amount numeric,
  target_outcome text,
  OUT shares numeric,
  OUT new_pools jsonb
)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k numeric;
  n integer;
  amount_per_pool numeric;
  outcome text;
  pool_value numeric;
  original_target_pool numeric;
  new_target_pool numeric;
  product_others numeric := 1;
  new_pools_temp jsonb;
BEGIN
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF NOT (pools ? target_outcome) THEN
    RAISE EXCEPTION 'Outcome % not found', target_outcome;
  END IF;

  n := (SELECT count(*) FROM jsonb_object_keys(pools));
  IF n < 2 THEN
    RAISE EXCEPTION 'Must have at least 2 outcomes';
  END IF;

  -- Calculate invariant
  k := calculate_fpmm_invariant(pools);
  original_target_pool := (pools->>target_outcome)::numeric;

  -- Add amount/(n-1) to all non-target pools
  amount_per_pool := amount / (n - 1);
  new_pools_temp := pools;

  FOR outcome IN SELECT jsonb_object_keys(pools)
  LOOP
    IF outcome != target_outcome THEN
      pool_value := (pools->>outcome)::numeric + amount_per_pool;
      new_pools_temp := jsonb_set(new_pools_temp, ARRAY[outcome], to_jsonb(pool_value));
    END IF;
  END LOOP;

  -- Calculate product of non-target pools
  FOR outcome IN SELECT jsonb_object_keys(new_pools_temp)
  LOOP
    IF outcome != target_outcome THEN
      pool_value := (new_pools_temp->>outcome)::numeric;
      product_others := product_others * pool_value;
    END IF;
  END LOOP;

  -- Solve for new target pool: q'_i = k / Π(q'_j)
  new_target_pool := k / product_others;
  new_pools_temp := jsonb_set(
    new_pools_temp,
    ARRAY[target_outcome],
    to_jsonb(new_target_pool)
  );

  -- Shares received
  shares := original_target_pool - new_target_pool;

  IF shares <= 0 THEN
    RAISE EXCEPTION 'Trade would result in non-positive shares';
  END IF;

  new_pools := new_pools_temp;
  RETURN;
END;
$$;

-- Create multi-resolution market
CREATE OR REPLACE FUNCTION create_market_multi(
  p_creator_id uuid,
  p_question text,
  p_description text,
  p_outcomes text[],
  p_liquidity_per_outcome numeric
)
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_market_id uuid;
  v_outcome text;
  v_outcome_pools jsonb := '{}';
  v_n integer;
BEGIN
  -- Validate inputs
  IF array_length(p_outcomes, 1) < 2 THEN
    RAISE EXCEPTION 'Must have at least 2 outcomes';
  END IF;

  IF array_length(p_outcomes, 1) > 10 THEN
    RAISE EXCEPTION 'Cannot have more than 10 outcomes';
  END IF;

  IF p_liquidity_per_outcome <= 0 THEN
    RAISE EXCEPTION 'Liquidity must be positive';
  END IF;

  v_n := array_length(p_outcomes, 1);

  -- Create equal probability pools
  FOREACH v_outcome IN ARRAY p_outcomes
  LOOP
    v_outcome_pools := jsonb_set(
      v_outcome_pools,
      ARRAY[v_outcome],
      to_jsonb(p_liquidity_per_outcome)
    );
  END LOOP;

  -- Insert market
  INSERT INTO markets (
    creator_id,
    question,
    description,
    market_type,
    outcomes,
    outcome_pools,
    total_liquidity,
    volume,
    status,
    created_at
  ) VALUES (
    p_creator_id,
    p_question,
    p_description,
    'multi',
    p_outcomes,
    v_outcome_pools,
    p_liquidity_per_outcome * v_n,
    0,
    'active',
    now()
  )
  RETURNING id INTO v_market_id;

  -- Record initial probability distribution
  INSERT INTO probability_history (
    market_id,
    probability_distribution,
    created_at
  ) VALUES (
    v_market_id,
    calculate_fpmm_probabilities(v_outcome_pools),
    now()
  );

  RETURN v_market_id;
END;
$$;

-- Execute trade on multi-resolution market
CREATE OR REPLACE FUNCTION execute_trade_multi(
  p_user_id uuid,
  p_market_id uuid,
  p_outcome text,
  p_amount numeric
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_market record;
  v_user_balance numeric;
  v_shares numeric;
  v_new_pools jsonb;
  v_new_probabilities jsonb;
  v_position record;
  v_current_shares numeric;
  v_trade_id uuid;
  v_old_prob numeric;
  v_new_prob numeric;
BEGIN
  -- Lock user and market
  SELECT balance INTO v_user_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Validate
  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF v_user_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  IF NOT (v_market.outcome_pools ? p_outcome) THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  -- Calculate probabilities before trade
  v_old_prob := (calculate_fpmm_probabilities(v_market.outcome_pools)->>p_outcome)::numeric;

  -- Calculate shares and new pools
  SELECT * INTO v_shares, v_new_pools
  FROM calculate_fpmm_buy(v_market.outcome_pools, p_amount, p_outcome);

  -- Calculate probabilities after trade
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);
  v_new_prob := (v_new_probabilities->>p_outcome)::numeric;

  -- Update user balance
  UPDATE profiles SET balance = balance - p_amount WHERE id = p_user_id;

  -- Update market
  UPDATE markets
  SET
    outcome_pools = v_new_pools,
    volume = volume + p_amount
  WHERE id = p_market_id;

  -- Update or insert position
  SELECT * INTO v_position FROM positions WHERE user_id = p_user_id AND market_id = p_market_id;

  IF v_position IS NULL THEN
    -- Create new position
    INSERT INTO positions (user_id, market_id, shares_by_outcome, total_invested)
    VALUES (
      p_user_id,
      p_market_id,
      jsonb_build_object(p_outcome, v_shares),
      p_amount
    );
  ELSE
    -- Update existing position
    v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);
    UPDATE positions
    SET
      shares_by_outcome = jsonb_set(
        COALESCE(shares_by_outcome, '{}'),
        ARRAY[p_outcome],
        to_jsonb(v_current_shares + v_shares)
      ),
      total_invested = total_invested + p_amount
    WHERE user_id = p_user_id AND market_id = p_market_id;
  END IF;

  -- Record trade
  INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after, created_at)
  VALUES (p_market_id, p_user_id, 'BUY', p_outcome, p_amount, v_shares, v_old_prob, v_new_prob, now())
  RETURNING id INTO v_trade_id;

  -- Record probability history
  INSERT INTO probability_history (market_id, probability_distribution, created_at)
  VALUES (p_market_id, v_new_probabilities, now());

  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'shares', v_shares,
    'new_probability', v_new_prob
  );
END;
$$;

-- Execute sell on multi-resolution market
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
  v_market record;
  v_position record;
  v_available_shares numeric;
  v_payout numeric;
  v_cost numeric;
  v_shares_to_sell numeric;
  v_new_pools jsonb;
  v_new_probabilities jsonb;
  v_trade_id uuid;
  v_old_prob numeric;
  v_new_prob numeric;
  v_low numeric;
  v_high numeric;
  v_mid numeric;
  v_test_shares numeric;
  v_epsilon numeric := 0.0001;
  v_iterations integer := 0;
  v_max_iterations integer := 100;
BEGIN
  -- Lock user and market
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;
  SELECT * INTO v_position FROM positions WHERE user_id = p_user_id AND market_id = p_market_id FOR UPDATE;

  IF v_market IS NULL THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Validate
  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  IF v_position IS NULL THEN
    RAISE EXCEPTION 'No position found';
  END IF;

  v_available_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);

  IF v_available_shares <= 0 THEN
    RAISE EXCEPTION 'No shares to sell';
  END IF;

  v_shares_to_sell := LEAST(p_shares, v_available_shares);

  IF v_shares_to_sell <= 0 THEN
    RAISE EXCEPTION 'Invalid share amount';
  END IF;

  -- Calculate probabilities before trade
  v_old_prob := (calculate_fpmm_probabilities(v_market.outcome_pools)->>p_outcome)::numeric;

  -- Binary search to find cost that gives us v_shares_to_sell
  v_low := 0;
  v_high := v_shares_to_sell;
  v_cost := 0;

  WHILE v_high - v_low > v_epsilon AND v_iterations < v_max_iterations LOOP
    v_mid := (v_low + v_high) / 2;

    BEGIN
      SELECT shares INTO v_test_shares
      FROM calculate_fpmm_buy(v_market.outcome_pools, v_mid, p_outcome);

      IF abs(v_test_shares - v_shares_to_sell) < v_epsilon THEN
        v_cost := v_mid;
        EXIT;
      END IF;

      IF v_test_shares < v_shares_to_sell THEN
        v_low := v_mid;
      ELSE
        v_high := v_mid;
      END IF;

      v_cost := v_mid;
    EXCEPTION WHEN OTHERS THEN
      v_high := v_mid;
    END;

    v_iterations := v_iterations + 1;
  END LOOP;

  v_payout := v_shares_to_sell - v_cost;

  IF v_payout < 0 THEN
    v_payout := 0;
  END IF;

  -- Calculate new pools (inverse of buy)
  SELECT new_pools INTO v_new_pools
  FROM calculate_fpmm_buy(v_market.outcome_pools, v_cost, p_outcome);

  -- Calculate probabilities after trade
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);
  v_new_prob := (v_new_probabilities->>p_outcome)::numeric;

  -- Update user balance
  UPDATE profiles SET balance = balance + v_payout WHERE id = p_user_id;

  -- Update market
  UPDATE markets
  SET
    outcome_pools = v_new_pools,
    volume = volume + v_payout
  WHERE id = p_market_id;

  -- Update position
  UPDATE positions
  SET
    shares_by_outcome = jsonb_set(
      shares_by_outcome,
      ARRAY[p_outcome],
      to_jsonb(v_available_shares - v_shares_to_sell)
    )
  WHERE user_id = p_user_id AND market_id = p_market_id;

  -- Record trade
  INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after, created_at)
  VALUES (p_market_id, p_user_id, 'SELL', p_outcome, v_payout, v_shares_to_sell, v_old_prob, v_new_prob, now())
  RETURNING id INTO v_trade_id;

  -- Record probability history
  INSERT INTO probability_history (market_id, probability_distribution, created_at)
  VALUES (p_market_id, v_new_probabilities, now());

  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'payout', v_payout,
    'shares_sold', v_shares_to_sell,
    'new_probability', v_new_prob
  );
END;
$$;

-- Resolve multi-resolution market
CREATE OR REPLACE FUNCTION resolve_market_multi(
  p_market_id uuid,
  p_winning_outcome text
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_market record;
  v_position record;
  v_winning_shares numeric;
  v_payout numeric;
BEGIN
  -- Lock market
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  IF p_winning_outcome != 'N/A' AND NOT (v_market.outcomes @> ARRAY[p_winning_outcome]) THEN
    RAISE EXCEPTION 'Invalid outcome';
  END IF;

  -- Update market status
  UPDATE markets
  SET
    status = 'resolved',
    resolution = p_winning_outcome,
    resolved_at = now()
  WHERE id = p_market_id;

  -- Payout winners
  IF p_winning_outcome = 'N/A' THEN
    -- Refund all users based on total_invested
    FOR v_position IN
      SELECT * FROM positions WHERE market_id = p_market_id
    LOOP
      UPDATE profiles
      SET balance = balance + v_position.total_invested
      WHERE id = v_position.user_id;

      INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after, created_at)
      VALUES (p_market_id, v_position.user_id, 'REDEEM', 'N/A', v_position.total_invested, 0, 0, 0, now());
    END LOOP;
  ELSE
    -- Payout winning shares (1 leaf per share)
    FOR v_position IN
      SELECT * FROM positions WHERE market_id = p_market_id
    LOOP
      v_winning_shares := COALESCE((v_position.shares_by_outcome->>p_winning_outcome)::numeric, 0);

      IF v_winning_shares > 0 THEN
        v_payout := v_winning_shares;

        UPDATE profiles
        SET balance = balance + v_payout
        WHERE id = v_position.user_id;

        INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after, created_at)
        VALUES (p_market_id, v_position.user_id, 'REDEEM', p_winning_outcome, v_payout, v_winning_shares, 1, 1, now());
      END IF;
    END LOOP;
  END IF;
END;
$$;
