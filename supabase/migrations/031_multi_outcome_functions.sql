-- Multi-Outcome Market Functions
-- Implements Fixed Product Market Maker (FPMM) algorithm

-- Helper function: Calculate FPMM probabilities
-- Formula: p(i) = (1/qᵢ) / Σ(1/qⱼ)
CREATE OR REPLACE FUNCTION calculate_fpmm_probabilities(pools jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  outcome text;
  pool_value numeric;
  inverse_sum numeric := 0;
  inverses jsonb := '{}';
  probabilities jsonb := '{}';
  prob numeric;
BEGIN
  -- Calculate sum of inverses
  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(pools)
  LOOP
    IF pool_value::numeric <= 0 THEN
      RAISE EXCEPTION 'Pool for % must be positive', outcome;
    END IF;
    inverse_sum := inverse_sum + (1.0 / pool_value::numeric);
    inverses := jsonb_set(inverses, ARRAY[outcome], to_jsonb(1.0 / pool_value::numeric));
  END LOOP;

  -- Calculate probabilities
  FOR outcome IN SELECT jsonb_object_keys(inverses)
  LOOP
    prob := (inverses->>outcome)::numeric / inverse_sum;
    probabilities := jsonb_set(probabilities, ARRAY[outcome], to_jsonb(prob));
  END LOOP;

  RETURN probabilities;
END;
$$;

-- Helper function: Calculate FPMM invariant
-- Formula: k = q₁ × q₂ × ... × qₙ
CREATE OR REPLACE FUNCTION calculate_fpmm_invariant(pools jsonb)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  outcome text;
  pool_value numeric;
  k numeric := 1;
BEGIN
  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(pools)
  LOOP
    IF pool_value::numeric <= 0 THEN
      RAISE EXCEPTION 'Pool for % must be positive', outcome;
    END IF;
    k := k * pool_value::numeric;
  END LOOP;

  RETURN k;
END;
$$;

-- Helper function: Calculate shares from FPMM buy
-- Algorithm:
-- 1. Calculate invariant k
-- 2. Add amount/(N-1) to all pools except target
-- 3. Solve for new target pool: q'ᵢ = k / ∏(q'ⱼ)
-- 4. Shares = qᵢ - q'ᵢ
CREATE OR REPLACE FUNCTION calculate_fpmm_buy(
  pools jsonb,
  amount numeric,
  target_outcome text
)
RETURNS TABLE(shares numeric, new_pools jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
  outcome text;
  pool_value numeric;
  k numeric;
  n integer;
  amount_per_pool numeric;
  new_pools_temp jsonb := '{}';
  product_others numeric := 1;
  new_target_pool numeric;
  original_target_pool numeric;
BEGIN
  -- Validate inputs
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF NOT pools ? target_outcome THEN
    RAISE EXCEPTION 'Outcome % not found in pools', target_outcome;
  END IF;

  -- Get number of outcomes
  SELECT count(*) INTO n FROM jsonb_object_keys(pools);

  IF n < 2 THEN
    RAISE EXCEPTION 'Must have at least 2 outcomes';
  END IF;

  -- Calculate invariant
  k := calculate_fpmm_invariant(pools);

  -- Store original target pool
  original_target_pool := (pools->>target_outcome)::numeric;

  -- Add amount/(N-1) to all pools except target
  amount_per_pool := amount / (n - 1);

  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(pools)
  LOOP
    IF outcome = target_outcome THEN
      -- Will calculate this last
      CONTINUE;
    END IF;

    new_pools_temp := jsonb_set(
      new_pools_temp,
      ARRAY[outcome],
      to_jsonb(pool_value::numeric + amount_per_pool)
    );
  END LOOP;

  -- Calculate product of all non-target pools
  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(new_pools_temp)
  LOOP
    product_others := product_others * pool_value::numeric;
  END LOOP;

  -- Solve for new target pool: q'ᵢ = k / ∏(q'ⱼ)
  new_target_pool := k / product_others;

  new_pools_temp := jsonb_set(
    new_pools_temp,
    ARRAY[target_outcome],
    to_jsonb(new_target_pool)
  );

  -- Calculate shares received
  shares := original_target_pool - new_target_pool;

  IF shares <= 0 THEN
    RAISE EXCEPTION 'Trade would result in non-positive shares';
  END IF;

  new_pools := new_pools_temp;
  RETURN NEXT;
END;
$$;

-- Create multi-outcome market
CREATE OR REPLACE FUNCTION create_market_multi(
  p_creator_id uuid,
  p_question text,
  p_description text,
  p_outcomes text[],
  p_ante numeric
)
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_market_id uuid;
  v_outcome text;
  v_pool_per_outcome numeric;
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

  IF p_ante <= 0 THEN
    RAISE EXCEPTION 'Ante must be positive';
  END IF;

  v_n := array_length(p_outcomes, 1);

  -- Check creator has sufficient balance
  PERFORM id FROM profiles
  WHERE id = p_creator_id AND balance >= p_ante
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance to create market';
  END IF;

  -- Deduct ante from creator
  UPDATE profiles
  SET balance = balance - p_ante
  WHERE id = p_creator_id;

  -- Create equal probability pools
  v_pool_per_outcome := p_ante / v_n;

  FOREACH v_outcome IN ARRAY p_outcomes
  LOOP
    v_outcome_pools := jsonb_set(
      v_outcome_pools,
      ARRAY[v_outcome],
      to_jsonb(v_pool_per_outcome)
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
    status,
    created_at
  ) VALUES (
    p_creator_id,
    p_question,
    p_description,
    'multi',
    p_outcomes,
    v_outcome_pools,
    'active',
    now()
  )
  RETURNING id INTO v_market_id;

  -- Record initial probability distribution
  INSERT INTO probability_history (
    market_id,
    probability_distribution,
    recorded_at
  ) VALUES (
    v_market_id,
    calculate_fpmm_probabilities(v_outcome_pools),
    now()
  );

  RETURN v_market_id;
END;
$$;

-- Execute buy trade on multi-outcome market
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
BEGIN
  -- Lock user row
  SELECT balance INTO v_user_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Lock market row
  SELECT * INTO v_market
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Validate market type
  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Market is not a multi-outcome market';
  END IF;

  -- Validate market status
  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  -- Validate outcome
  IF NOT (p_outcome = ANY(v_market.outcomes)) THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Check user balance
  IF v_user_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Calculate shares from FPMM
  SELECT s.shares, s.new_pools
  INTO v_shares, v_new_pools
  FROM calculate_fpmm_buy(v_market.outcome_pools, p_amount, p_outcome) s;

  -- Update user balance
  UPDATE profiles
  SET balance = balance - p_amount
  WHERE id = p_user_id;

  -- Update market pools
  UPDATE markets
  SET outcome_pools = v_new_pools
  WHERE id = p_market_id;

  -- Calculate new probabilities
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);

  -- Update or insert position
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND market_id = p_market_id
  FOR UPDATE;

  IF FOUND THEN
    -- Get current shares for this outcome
    v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);

    -- Update position
    UPDATE positions
    SET
      shares_by_outcome = jsonb_set(
        COALESCE(shares_by_outcome, '{}'),
        ARRAY[p_outcome],
        to_jsonb(v_current_shares + v_shares)
      ),
      total_invested = total_invested + p_amount
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    -- Create new position
    INSERT INTO positions (
      user_id,
      market_id,
      shares_by_outcome,
      total_invested
    ) VALUES (
      p_user_id,
      p_market_id,
      jsonb_build_object(p_outcome, v_shares),
      p_amount
    );
  END IF;

  -- Record trade
  INSERT INTO trades (
    user_id,
    market_id,
    trade_type,
    outcome,
    shares,
    price,
    created_at
  ) VALUES (
    p_user_id,
    p_market_id,
    'buy',
    p_outcome,
    v_shares,
    p_amount,
    now()
  )
  RETURNING id INTO v_trade_id;

  -- Record probability snapshot
  INSERT INTO probability_history (
    market_id,
    probability_distribution,
    recorded_at
  ) VALUES (
    p_market_id,
    v_new_probabilities,
    now()
  );

  -- Return result
  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'shares', v_shares,
    'cost', p_amount,
    'new_pools', v_new_pools,
    'new_probabilities', v_new_probabilities
  );
END;
$$;

-- Execute sell trade on multi-outcome market
-- Uses binary search to find cost M where buying M gives exactly the shares to sell
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
  v_current_shares numeric;
  v_low numeric := 0;
  v_high numeric;
  v_mid numeric;
  v_epsilon numeric := 0.0001;
  v_max_iterations integer := 100;
  v_iterations integer := 0;
  v_best_cost numeric;
  v_test_shares numeric;
  v_test_pools jsonb;
  v_payout numeric;
  v_new_pools jsonb;
  v_new_probabilities jsonb;
  v_remaining_shares numeric;
  v_trade_id uuid;
BEGIN
  -- Validate amount
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Shares must be positive';
  END IF;

  -- Lock user and get position
  SELECT p.* INTO v_position
  FROM positions p
  WHERE p.user_id = p_user_id AND p.market_id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No position found';
  END IF;

  -- Get current shares for this outcome
  v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);

  IF v_current_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient shares to sell';
  END IF;

  -- Lock market
  SELECT * INTO v_market
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Validate market type
  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Market is not a multi-outcome market';
  END IF;

  -- Validate market status
  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  -- Validate outcome
  IF NOT (p_outcome = ANY(v_market.outcomes)) THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  -- Binary search for cost
  v_high := p_shares;
  v_best_cost := 0;

  WHILE (v_high - v_low > v_epsilon) AND (v_iterations < v_max_iterations) LOOP
    v_mid := (v_low + v_high) / 2;

    -- Test if buying v_mid gives us p_shares
    BEGIN
      SELECT s.shares, s.new_pools
      INTO v_test_shares, v_test_pools
      FROM calculate_fpmm_buy(v_market.outcome_pools, v_mid, p_outcome) s;

      IF abs(v_test_shares - p_shares) < v_epsilon THEN
        -- Found exact match
        v_best_cost := v_mid;
        v_new_pools := v_test_pools;
        EXIT;
      END IF;

      IF v_test_shares < p_shares THEN
        -- Need more shares, increase cost
        v_low := v_mid;
      ELSE
        -- Got too many shares, decrease cost
        v_high := v_mid;
      END IF;

      v_best_cost := v_mid;
      v_new_pools := v_test_pools;

    EXCEPTION WHEN OTHERS THEN
      -- If calculation fails, try lower amount
      v_high := v_mid;
    END;

    v_iterations := v_iterations + 1;
  END LOOP;

  -- Calculate payout
  v_payout := p_shares - v_best_cost;

  IF v_payout < 0 THEN
    RAISE EXCEPTION 'Payout cannot be negative';
  END IF;

  -- Update user balance
  UPDATE profiles
  SET balance = balance + v_payout
  WHERE id = p_user_id;

  -- Update market pools
  UPDATE markets
  SET outcome_pools = v_new_pools
  WHERE id = p_market_id;

  -- Calculate new probabilities
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);

  -- Update position
  v_remaining_shares := v_current_shares - p_shares;

  IF v_remaining_shares > 0.0001 THEN
    UPDATE positions
    SET shares_by_outcome = jsonb_set(
      shares_by_outcome,
      ARRAY[p_outcome],
      to_jsonb(v_remaining_shares)
    )
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    -- Remove outcome from shares_by_outcome
    UPDATE positions
    SET shares_by_outcome = shares_by_outcome - p_outcome
    WHERE user_id = p_user_id AND market_id = p_market_id;

    -- If no shares left at all, delete position
    DELETE FROM positions
    WHERE user_id = p_user_id
      AND market_id = p_market_id
      AND shares_by_outcome = '{}';
  END IF;

  -- Record trade
  INSERT INTO trades (
    user_id,
    market_id,
    trade_type,
    outcome,
    shares,
    price,
    created_at
  ) VALUES (
    p_user_id,
    p_market_id,
    'sell',
    p_outcome,
    p_shares,
    v_payout,
    now()
  )
  RETURNING id INTO v_trade_id;

  -- Record probability snapshot
  INSERT INTO probability_history (
    market_id,
    probability_distribution,
    recorded_at
  ) VALUES (
    p_market_id,
    v_new_probabilities,
    now()
  );

  -- Return result
  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'shares', p_shares,
    'payout', v_payout,
    'new_pools', v_new_pools,
    'new_probabilities', v_new_probabilities
  );
END;
$$;

-- Resolve multi-outcome market
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
  SELECT * INTO v_market
  FROM markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  -- Validate market type
  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Market is not a multi-outcome market';
  END IF;

  -- Validate market status
  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market is not active';
  END IF;

  -- Handle N/A resolution (refund all)
  IF p_winning_outcome = 'N/A' THEN
    -- Refund all users their total_invested
    FOR v_position IN
      SELECT user_id, total_invested
      FROM positions
      WHERE market_id = p_market_id
      FOR UPDATE
    LOOP
      UPDATE profiles
      SET balance = balance + v_position.total_invested
      WHERE id = v_position.user_id;
    END LOOP;

    -- Update market status
    UPDATE markets
    SET status = 'resolved', resolution = 'N/A', resolved_at = now()
    WHERE id = p_market_id;

    RETURN;
  END IF;

  -- Validate winning outcome
  IF NOT (p_winning_outcome = ANY(v_market.outcomes)) THEN
    RAISE EXCEPTION 'Invalid winning outcome: %', p_winning_outcome;
  END IF;

  -- Payout winning shares (1 leaf per share)
  FOR v_position IN
    SELECT user_id, shares_by_outcome
    FROM positions
    WHERE market_id = p_market_id
    FOR UPDATE
  LOOP
    v_winning_shares := COALESCE(
      (v_position.shares_by_outcome->>p_winning_outcome)::numeric,
      0
    );

    IF v_winning_shares > 0 THEN
      UPDATE profiles
      SET balance = balance + v_winning_shares
      WHERE id = v_position.user_id;
    END IF;
  END LOOP;

  -- Update market status
  UPDATE markets
  SET
    status = 'resolved',
    resolution = p_winning_outcome,
    resolved_at = now()
  WHERE id = p_market_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_fpmm_probabilities TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fpmm_invariant TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fpmm_buy TO authenticated;
GRANT EXECUTE ON FUNCTION create_market_multi TO authenticated;
GRANT EXECUTE ON FUNCTION execute_trade_multi TO authenticated;
GRANT EXECUTE ON FUNCTION execute_sell_multi TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_market_multi TO authenticated;
