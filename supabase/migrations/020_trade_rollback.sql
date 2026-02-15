-- ============================================
-- Migration 020: Admin Trade Rollback
--
-- Adds the ability for admins to rollback trades.
-- Rolling back a trade atomically reverses all
-- database side-effects: user balance, position,
-- market pools, probability, volume, and
-- probability history. Associated auto-REDEEM
-- trades are also reversed.
-- ============================================

-- 1. Add is_rolled_back column to trades table
ALTER TABLE public.trades
  ADD COLUMN is_rolled_back boolean NOT NULL DEFAULT false;

-- 2. Create rollback_trade function
CREATE OR REPLACE FUNCTION public.rollback_trade(p_trade_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_trade RECORD;
  v_redeem RECORD;
  v_market RECORD;
  v_position RECORD;
  v_new_pool_yes numeric;
  v_new_pool_no numeric;
  v_new_prob numeric;
  v_p numeric;
  v_cost_m numeric;
  v_pos_yes_after numeric;
  v_pos_no_after numeric;
BEGIN
  -- Fetch and lock the trade
  SELECT * INTO v_trade
  FROM public.trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF v_trade IS NULL THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.is_rolled_back THEN
    RAISE EXCEPTION 'Trade already rolled back';
  END IF;

  IF v_trade.type = 'REDEEM' THEN
    RAISE EXCEPTION 'Cannot directly rollback REDEEM trades; rollback the parent BUY/SELL instead';
  END IF;

  -- Fetch and lock market
  SELECT * INTO v_market
  FROM public.markets
  WHERE id = v_trade.market_id
  FOR UPDATE;

  IF v_market IS NULL THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  IF v_market.status != 'active' THEN
    RAISE EXCEPTION 'Cannot rollback trades on resolved or cancelled markets';
  END IF;

  v_p := v_market.p;

  -- Lock user profile
  PERFORM 1 FROM public.profiles
  WHERE id = v_trade.user_id
  FOR UPDATE;

  -- Fetch and lock position
  SELECT * INTO v_position
  FROM public.positions
  WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id
  FOR UPDATE;

  -- Handle missing position for SELL reversal (needs to restore shares)
  IF v_position IS NULL AND v_trade.type = 'SELL' THEN
    INSERT INTO public.positions (user_id, market_id, yes_shares, no_shares, total_invested)
    VALUES (v_trade.user_id, v_trade.market_id, 0, 0, 0);

    SELECT * INTO v_position
    FROM public.positions
    WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id
    FOR UPDATE;
  ELSIF v_position IS NULL THEN
    RAISE EXCEPTION 'Cannot rollback: no position record found for user';
  END IF;

  -- === Step 1: Find and reverse associated REDEEM trade ===
  SELECT * INTO v_redeem
  FROM public.trades
  WHERE market_id = v_trade.market_id
    AND user_id = v_trade.user_id
    AND type = 'REDEEM'
    AND is_rolled_back = false
    AND created_at = v_trade.created_at
  FOR UPDATE;

  IF v_redeem IS NOT NULL THEN
    -- Reverse REDEEM effects:
    -- Original: balance += redeemed, yes_shares -= redeemed, no_shares -= redeemed, total_invested -= redeemed
    -- Reversal: balance -= redeemed, yes_shares += redeemed, no_shares += redeemed, total_invested += redeemed
    UPDATE public.profiles
    SET balance = balance - v_redeem.amount
    WHERE id = v_trade.user_id;

    UPDATE public.positions
    SET yes_shares = yes_shares + v_redeem.shares,
        no_shares = no_shares + v_redeem.shares,
        total_invested = total_invested + v_redeem.amount
    WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;

    UPDATE public.trades SET is_rolled_back = true WHERE id = v_redeem.id;

    -- Re-fetch position after REDEEM reversal for accurate checks below
    SELECT * INTO v_position
    FROM public.positions
    WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;
  END IF;

  -- === Step 2: Reverse the BUY/SELL trade ===
  IF v_trade.type = 'BUY' THEN
    -- Reverse balance: refund the purchase amount
    UPDATE public.profiles
    SET balance = balance + v_trade.amount
    WHERE id = v_trade.user_id;

    -- Check position won't go negative after removing shares
    v_pos_yes_after := v_position.yes_shares
                       - CASE WHEN v_trade.outcome = 'YES' THEN v_trade.shares ELSE 0 END;
    v_pos_no_after := v_position.no_shares
                      - CASE WHEN v_trade.outcome = 'NO' THEN v_trade.shares ELSE 0 END;

    IF v_pos_yes_after < -0.000001 THEN
      RAISE EXCEPTION 'Cannot rollback: user yes_shares would go negative (%). They may have already sold these shares.', round(v_pos_yes_after::numeric, 4);
    END IF;
    IF v_pos_no_after < -0.000001 THEN
      RAISE EXCEPTION 'Cannot rollback: user no_shares would go negative (%). They may have already sold these shares.', round(v_pos_no_after::numeric, 4);
    END IF;

    -- Reverse position
    IF v_trade.outcome = 'YES' THEN
      UPDATE public.positions
      SET yes_shares = yes_shares - v_trade.shares,
          total_invested = total_invested - v_trade.amount
      WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;
    ELSE
      UPDATE public.positions
      SET no_shares = no_shares - v_trade.shares,
          total_invested = total_invested - v_trade.amount
      WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;
    END IF;

    -- Reverse pool deltas
    -- BUY YES: pool_yes had delta (amount - shares), pool_no had delta +amount
    -- BUY NO:  pool_yes had delta +amount, pool_no had delta (amount - shares)
    IF v_trade.outcome = 'YES' THEN
      v_new_pool_yes := v_market.pool_yes + (v_trade.shares - v_trade.amount);
      v_new_pool_no := v_market.pool_no - v_trade.amount;
    ELSE
      v_new_pool_yes := v_market.pool_yes - v_trade.amount;
      v_new_pool_no := v_market.pool_no + (v_trade.shares - v_trade.amount);
    END IF;

  ELSIF v_trade.type = 'SELL' THEN
    -- Reverse balance: deduct the payout
    -- The CHECK (balance >= 0) constraint will abort if insufficient
    UPDATE public.profiles
    SET balance = balance - v_trade.amount
    WHERE id = v_trade.user_id;

    -- Reverse position: restore shares that were sold
    -- NOTE: execute_sell does NOT modify total_invested, so neither should rollback
    IF v_trade.outcome = 'YES' THEN
      UPDATE public.positions
      SET yes_shares = yes_shares + v_trade.shares
      WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;
    ELSE
      UPDATE public.positions
      SET no_shares = no_shares + v_trade.shares
      WHERE user_id = v_trade.user_id AND market_id = v_trade.market_id;
    END IF;

    -- Reverse pool deltas
    -- SELL YES: pool_yes had delta +(shares-amount), pool_no had delta -amount
    -- SELL NO:  pool_yes had delta -amount, pool_no had delta +(shares-amount)
    v_cost_m := v_trade.shares - v_trade.amount;
    IF v_trade.outcome = 'YES' THEN
      v_new_pool_yes := v_market.pool_yes - v_cost_m;
      v_new_pool_no := v_market.pool_no + v_trade.amount;
    ELSE
      v_new_pool_yes := v_market.pool_yes + v_trade.amount;
      v_new_pool_no := v_market.pool_no - v_cost_m;
    END IF;
  END IF;

  -- Validate pool values stay positive
  IF v_new_pool_yes <= 0 OR v_new_pool_no <= 0 THEN
    RAISE EXCEPTION 'Cannot rollback: pool values would go non-positive (pool_yes=%, pool_no=%). Too many subsequent trades may depend on this trade.',
      round(v_new_pool_yes::numeric, 4), round(v_new_pool_no::numeric, 4);
  END IF;

  -- Recalculate probability from new pools
  v_new_prob := (v_p * v_new_pool_no) / ((1.0 - v_p) * v_new_pool_yes + v_p * v_new_pool_no);

  -- Update market
  UPDATE public.markets
  SET pool_yes = v_new_pool_yes,
      pool_no = v_new_pool_no,
      probability = v_new_prob,
      volume = GREATEST(0, volume - v_trade.amount)
  WHERE id = v_trade.market_id;

  -- Mark trade as rolled back
  UPDATE public.trades SET is_rolled_back = true WHERE id = p_trade_id;

  -- Remove probability_history entry from this trade and insert updated one
  DELETE FROM public.probability_history
  WHERE market_id = v_trade.market_id
    AND created_at = v_trade.created_at;

  INSERT INTO public.probability_history (market_id, probability)
  VALUES (v_trade.market_id, v_new_prob);

  RETURN jsonb_build_object(
    'rolled_back_trade_id', p_trade_id,
    'rolled_back_redeem_id', v_redeem.id,
    'new_pool_yes', v_new_pool_yes,
    'new_pool_no', v_new_pool_no,
    'new_probability', v_new_prob,
    'type', v_trade.type,
    'outcome', v_trade.outcome,
    'amount', v_trade.amount,
    'shares', v_trade.shares
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Set permissions (admin-only via service_role)
REVOKE EXECUTE ON FUNCTION public.rollback_trade(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollback_trade(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rollback_trade(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rollback_trade(uuid) TO service_role;
