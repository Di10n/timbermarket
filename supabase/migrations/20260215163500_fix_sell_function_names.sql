-- Fix execute_sell_multi to use correct function names
-- Previous version used get_fpmm_probabilities which doesn't exist
-- Should use calculate_fpmm_probabilities instead

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
