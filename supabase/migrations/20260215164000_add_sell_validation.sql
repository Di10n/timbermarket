-- Add validation to sell function to check invariant is maintained
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
  v_k_after numeric;
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

  -- VALIDATION: Check that invariant is preserved
  v_k_after := 1;
  FOREACH v_outcome IN ARRAY v_outcomes LOOP
    v_k_after := v_k_after * (v_new_pools->>v_outcome)::numeric;
  END LOOP;

  -- Allow small floating point error (0.1%)
  IF abs(v_k_after - v_k) > v_k * 0.001 THEN
    RAISE EXCEPTION 'Invariant not preserved! Before: %, After: %, Diff: %', v_k, v_k_after, abs(v_k_after - v_k);
  END IF;

  -- VALIDATION: Check payout is reasonable (should be less than shares sold)
  IF payout > p_shares_to_sell THEN
    RAISE WARNING 'Payout (%) is greater than shares sold (%) - this might indicate a problem', payout, p_shares_to_sell;
  END IF;

  RETURN NEXT;
END;
$$;
