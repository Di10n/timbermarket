-- Fix resolve_market_multi to use positive shares value for N/A redemptions
-- The trades table has a CHECK constraint requiring shares > 0

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

      -- Use 1 as placeholder for shares since trades table requires shares > 0
      INSERT INTO trades (market_id, user_id, type, outcome, amount, shares, prob_before, prob_after, created_at)
      VALUES (p_market_id, v_position.user_id, 'REDEEM', 'N/A', v_position.total_invested, 1, 0, 0, now());
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
