-- Fix sell algorithm to properly handle negative pools in binary search
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
  v_best_mid numeric;
  v_best_diff numeric;
  v_test_product numeric;
  v_target_product numeric;
  v_outcome text;
  v_iterations integer := 0;
  v_max_iterations integer := 100;
  v_epsilon numeric := 0.0001;
  v_k_after numeric;
  v_pool_value numeric;
  v_min_pool numeric;
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

  -- Find minimum non-target pool (this limits how much we can remove)
  v_min_pool := NULL;
  FOREACH v_outcome IN ARRAY v_outcomes LOOP
    IF v_outcome != p_outcome THEN
      v_pool_value := (p_pools->>v_outcome)::numeric;
      IF v_min_pool IS NULL OR v_pool_value < v_min_pool THEN
        v_min_pool := v_pool_value;
      END IF;
    END IF;
  END LOOP;

  -- Binary search for payout amount P
  v_low := 0;
  v_high := v_min_pool * (v_n - 1) * 0.99; -- Can't remove more than the smallest pool
  v_best_mid := 0;
  v_best_diff := v_target_product; -- Large initial difference

  WHILE v_high - v_low > v_epsilon AND v_iterations < v_max_iterations LOOP
    v_mid := (v_low + v_high) / 2;

    -- Calculate product of (pool - mid/(N-1)) for all non-target pools
    v_test_product := 1;
    FOREACH v_outcome IN ARRAY v_outcomes LOOP
      IF v_outcome != p_outcome THEN
        v_pool_value := (p_pools->>v_outcome)::numeric - v_mid / (v_n - 1);

        -- If any pool would be negative, this payout is too high
        IF v_pool_value <= 0 THEN
          v_high := v_mid;
          v_test_product := -1; -- Invalid
          EXIT;
        END IF;

        v_test_product := v_test_product * v_pool_value;
      END IF;
    END LOOP;

    -- Skip if we got negative pools
    IF v_test_product <= 0 THEN
      v_iterations := v_iterations + 1;
      CONTINUE;
    END IF;

    -- Track best solution
    IF abs(v_test_product - v_target_product) < v_best_diff THEN
      v_best_diff := abs(v_test_product - v_target_product);
      v_best_mid := v_mid;
    END IF;

    IF abs(v_test_product - v_target_product) < v_epsilon THEN
      -- Found it
      v_best_mid := v_mid;
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

  -- Use best found value
  payout := v_best_mid;

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
    v_pool_value := (v_new_pools->>v_outcome)::numeric;
    IF v_pool_value <= 0 THEN
      RAISE EXCEPTION 'Pool for % is non-positive: %', v_outcome, v_pool_value;
    END IF;
    v_k_after := v_k_after * v_pool_value;
  END LOOP;

  -- Allow 1% error for large numbers
  IF abs(v_k_after - v_k) > v_k * 0.01 THEN
    RAISE EXCEPTION 'Invariant not preserved! Before: %, After: %, Diff: %, Relative: %',
      v_k, v_k_after, abs(v_k_after - v_k), abs(v_k_after - v_k) / v_k;
  END IF;

  RETURN NEXT;
END;
$$;
