-- Fix: Allow admins to create multi-outcome markets without balance checks
-- Match the behavior of create_market() for binary markets

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

  -- REMOVED: Balance check and deduction (admins don't need balance)
  -- Markets are created with liquidity from the ante parameter, not from user balance

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

-- Update comment to reflect correct behavior
COMMENT ON FUNCTION create_market_multi IS 'Create a multi-outcome market (admin only, no balance check required)';
