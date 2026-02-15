-- ============================================
-- Multi Resolution Markets
-- ============================================
-- Adds support for multi-outcome markets using FPMM algorithm
-- Binary markets remain unchanged (backward compatible)

-- ============================================
-- STEP 1: Schema Changes
-- ============================================

-- Add market_type column (default binary for existing markets)
ALTER TABLE markets
ADD COLUMN market_type text NOT NULL DEFAULT 'binary'
CHECK (market_type IN ('binary', 'multi'));

-- Add multi-resolution market columns
ALTER TABLE markets
ADD COLUMN outcomes text[], -- Array of outcome names: ['OpenAI', 'Anthropic', 'NVIDIA']
ADD COLUMN outcome_pools jsonb; -- FPMM pools: {"OpenAI": 250, "Anthropic": 250}

-- Make binary fields nullable (multi markets don't use them)
ALTER TABLE markets
ALTER COLUMN pool_yes DROP NOT NULL,
ALTER COLUMN pool_no DROP NOT NULL,
ALTER COLUMN p DROP NOT NULL,
ALTER COLUMN probability DROP NOT NULL;

-- Add constraint: binary markets must have binary fields, multi markets must have multi fields
ALTER TABLE markets
ADD CONSTRAINT market_type_fields_check CHECK (
  (market_type = 'binary' AND
   pool_yes IS NOT NULL AND
   pool_no IS NOT NULL AND
   p IS NOT NULL AND
   probability IS NOT NULL AND
   outcomes IS NULL AND
   outcome_pools IS NULL)
  OR
  (market_type = 'multi' AND
   outcomes IS NOT NULL AND
   outcome_pools IS NOT NULL AND
   array_length(outcomes, 1) >= 2 AND
   array_length(outcomes, 1) <= 10 AND
   pool_yes IS NULL AND
   pool_no IS NULL AND
   p IS NULL AND
   probability IS NULL)
);

-- Add shares_by_outcome for multi-resolution positions
ALTER TABLE positions
ADD COLUMN shares_by_outcome jsonb; -- {"OpenAI": 10.5, "Anthropic": 5.2}

-- Remove outcome constraint on trades (allow dynamic outcome names)
ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_outcome_check;

-- Add probability_distribution for multi-resolution history
ALTER TABLE probability_history
ADD COLUMN probability_distribution jsonb; -- {"OpenAI": 0.45, "Anthropic": 0.30}

-- Make probability nullable (multi markets use probability_distribution)
ALTER TABLE probability_history
ALTER COLUMN probability DROP NOT NULL;

-- Add constraint: at least one probability field must be set
ALTER TABLE probability_history
ADD CONSTRAINT probability_data_check CHECK (
  probability IS NOT NULL OR probability_distribution IS NOT NULL
);

-- Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_markets_type ON markets(market_type);
CREATE INDEX IF NOT EXISTS idx_markets_outcomes ON markets USING GIN(outcomes);

-- Add comments
COMMENT ON COLUMN markets.market_type IS 'Market type: binary (YES/NO) or multi (multiple outcomes)';
COMMENT ON COLUMN markets.outcomes IS 'Multi-resolution: Array of outcome names';
COMMENT ON COLUMN markets.outcome_pools IS 'Multi-resolution: FPMM pool reserves by outcome';
COMMENT ON COLUMN positions.shares_by_outcome IS 'Multi-resolution: Share holdings by outcome';
COMMENT ON COLUMN probability_history.probability_distribution IS 'Multi-resolution: Probability distribution across outcomes';

-- ============================================
-- STEP 2: FPMM Helper Functions
-- ============================================

-- Calculate FPMM probabilities
-- Formula: p(i) = (1/q_i) / Σ(1/q_j)
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

-- Calculate FPMM invariant
-- Formula: k = q_1 × q_2 × ... × q_n
CREATE OR REPLACE FUNCTION calculate_fpmm_invariant(pools jsonb)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  pool_value numeric;
  k numeric := 1;
BEGIN
  FOR pool_value IN SELECT value::numeric FROM jsonb_each_text(pools)
  LOOP
    IF pool_value <= 0 THEN
      RAISE EXCEPTION 'Pool must be positive';
    END IF;
    k := k * pool_value;
  END LOOP;
  RETURN k;
END;
$$;

-- Calculate shares from FPMM buy
-- Algorithm: Add bet/(N-1) to all non-target pools, solve for new target pool
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
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF NOT pools ? target_outcome THEN
    RAISE EXCEPTION 'Outcome % not found', target_outcome;
  END IF;

  -- Get number of outcomes
  SELECT count(*) INTO n FROM jsonb_object_keys(pools);

  IF n < 2 THEN
    RAISE EXCEPTION 'Must have at least 2 outcomes';
  END IF;

  -- Calculate invariant
  k := calculate_fpmm_invariant(pools);
  original_target_pool := (pools->>target_outcome)::numeric;

  -- Add amount/(N-1) to all pools except target
  amount_per_pool := amount / (n - 1);

  FOR outcome, pool_value IN SELECT * FROM jsonb_each_text(pools)
  LOOP
    IF outcome = target_outcome THEN
      CONTINUE;
    END IF;
    new_pools_temp := jsonb_set(
      new_pools_temp,
      ARRAY[outcome],
      to_jsonb(pool_value::numeric + amount_per_pool)
    );
  END LOOP;

  -- Calculate product of non-target pools
  FOR pool_value IN SELECT value::numeric FROM jsonb_each_text(new_pools_temp)
  LOOP
    product_others := product_others * pool_value;
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
  RETURN NEXT;
END;
$$;

-- ============================================
-- STEP 3: Multi-Resolution Market Functions
-- ============================================

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
    RAISE EXCEPTION 'Market not active';
  END IF;

  IF NOT (p_outcome = ANY(v_market.outcomes)) THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF v_user_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Calculate shares using FPMM
  SELECT s.shares, s.new_pools
  INTO v_shares, v_new_pools
  FROM calculate_fpmm_buy(v_market.outcome_pools, p_amount, p_outcome) s;

  -- Get old and new probabilities
  v_old_prob := (calculate_fpmm_probabilities(v_market.outcome_pools)->>p_outcome)::numeric;
  v_new_prob := (calculate_fpmm_probabilities(v_new_pools)->>p_outcome)::numeric;

  -- Update user balance
  UPDATE profiles SET balance = balance - p_amount WHERE id = p_user_id;

  -- Update market
  UPDATE markets
  SET outcome_pools = v_new_pools,
      volume = volume + p_amount
  WHERE id = p_market_id;

  -- Calculate new probabilities
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);

  -- Update position
  SELECT * INTO v_position
  FROM positions
  WHERE user_id = p_user_id AND market_id = p_market_id
  FOR UPDATE;

  IF FOUND THEN
    v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);
    UPDATE positions
    SET shares_by_outcome = jsonb_set(
          COALESCE(shares_by_outcome, '{}'),
          ARRAY[p_outcome],
          to_jsonb(v_current_shares + v_shares)
        ),
        total_invested = total_invested + p_amount
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    INSERT INTO positions (user_id, market_id, shares_by_outcome, total_invested)
    VALUES (p_user_id, p_market_id, jsonb_build_object(p_outcome, v_shares), p_amount);
  END IF;

  -- Record trade
  INSERT INTO trades (user_id, market_id, type, outcome, shares, amount, prob_before, prob_after, created_at)
  VALUES (p_user_id, p_market_id, 'BUY', p_outcome, v_shares, p_amount, v_old_prob, v_new_prob, now())
  RETURNING id INTO v_trade_id;

  -- Record probability snapshot
  INSERT INTO probability_history (market_id, probability_distribution, created_at)
  VALUES (p_market_id, v_new_probabilities, now());

  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'shares', v_shares,
    'cost', p_amount,
    'new_probabilities', v_new_probabilities
  );
END;
$$;

-- Execute sell on multi-resolution market (binary search for payout)
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
  v_payout numeric;
  v_new_pools jsonb;
  v_new_probabilities jsonb;
  v_trade_id uuid;
  v_old_prob numeric;
  v_new_prob numeric;
  -- Binary search variables
  v_low numeric := 0;
  v_high numeric;
  v_mid numeric;
  v_test_shares numeric;
  v_test_pools jsonb;
  v_best_cost numeric := 0;
  v_epsilon numeric := 0.0001;
  v_max_iterations integer := 100;
  v_iterations integer := 0;
BEGIN
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Shares must be positive';
  END IF;

  -- Lock position and market
  SELECT p.* INTO v_position
  FROM positions p
  WHERE p.user_id = p_user_id AND p.market_id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No position found';
  END IF;

  v_current_shares := COALESCE((v_position.shares_by_outcome->>p_outcome)::numeric, 0);

  IF v_current_shares < p_shares THEN
    RAISE EXCEPTION 'Insufficient shares';
  END IF;

  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market not active';
  END IF;

  -- Binary search for cost
  v_high := p_shares;

  WHILE (v_high - v_low > v_epsilon) AND (v_iterations < v_max_iterations) LOOP
    v_mid := (v_low + v_high) / 2;

    BEGIN
      SELECT s.shares, s.new_pools
      INTO v_test_shares, v_test_pools
      FROM calculate_fpmm_buy(v_market.outcome_pools, v_mid, p_outcome) s;

      IF abs(v_test_shares - p_shares) < v_epsilon THEN
        v_best_cost := v_mid;
        v_new_pools := v_test_pools;
        EXIT;
      END IF;

      IF v_test_shares < p_shares THEN
        v_low := v_mid;
      ELSE
        v_high := v_mid;
      END IF;

      v_best_cost := v_mid;
      v_new_pools := v_test_pools;
    EXCEPTION WHEN OTHERS THEN
      v_high := v_mid;
    END;

    v_iterations := v_iterations + 1;
  END LOOP;

  v_payout := p_shares - v_best_cost;

  IF v_payout < 0 THEN
    RAISE EXCEPTION 'Payout cannot be negative';
  END IF;

  -- Get probabilities
  v_old_prob := (calculate_fpmm_probabilities(v_market.outcome_pools)->>p_outcome)::numeric;
  v_new_prob := (calculate_fpmm_probabilities(v_new_pools)->>p_outcome)::numeric;

  -- Update user balance
  UPDATE profiles SET balance = balance + v_payout WHERE id = p_user_id;

  -- Update market
  UPDATE markets SET outcome_pools = v_new_pools WHERE id = p_market_id;

  -- Calculate new probabilities
  v_new_probabilities := calculate_fpmm_probabilities(v_new_pools);

  -- Update position
  IF v_current_shares - p_shares > 0.0001 THEN
    UPDATE positions
    SET shares_by_outcome = jsonb_set(
          shares_by_outcome,
          ARRAY[p_outcome],
          to_jsonb(v_current_shares - p_shares)
        )
    WHERE user_id = p_user_id AND market_id = p_market_id;
  ELSE
    UPDATE positions
    SET shares_by_outcome = shares_by_outcome - p_outcome
    WHERE user_id = p_user_id AND market_id = p_market_id;

    DELETE FROM positions
    WHERE user_id = p_user_id AND market_id = p_market_id
      AND (shares_by_outcome = '{}' OR shares_by_outcome IS NULL);
  END IF;

  -- Record trade
  INSERT INTO trades (user_id, market_id, type, outcome, shares, amount, prob_before, prob_after, created_at)
  VALUES (p_user_id, p_market_id, 'SELL', p_outcome, p_shares, v_payout, v_old_prob, v_new_prob, now())
  RETURNING id INTO v_trade_id;

  -- Record probability snapshot
  INSERT INTO probability_history (market_id, probability_distribution, created_at)
  VALUES (p_market_id, v_new_probabilities, now());

  RETURN jsonb_build_object(
    'trade_id', v_trade_id,
    'shares', p_shares,
    'payout', v_payout,
    'new_probabilities', v_new_probabilities
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
BEGIN
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_market.market_type != 'multi' THEN
    RAISE EXCEPTION 'Not a multi-resolution market';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Market not active';
  END IF;

  -- Handle N/A (refund all)
  IF p_winning_outcome = 'N/A' THEN
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

    UPDATE markets
    SET status = 'resolved', resolution = 'N/A', resolved_at = now()
    WHERE id = p_market_id;

    RETURN;
  END IF;

  -- Validate winning outcome
  IF NOT (p_winning_outcome = ANY(v_market.outcomes)) THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_winning_outcome;
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
  SET status = 'resolved', resolution = p_winning_outcome, resolved_at = now()
  WHERE id = p_market_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_fpmm_probabilities TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fpmm_invariant TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_fpmm_buy TO authenticated;
GRANT EXECUTE ON FUNCTION create_market_multi TO authenticated;
GRANT EXECUTE ON FUNCTION execute_trade_multi TO authenticated;
GRANT EXECUTE ON FUNCTION execute_sell_multi TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_market_multi TO authenticated;
