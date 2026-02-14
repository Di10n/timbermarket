-- ============================================
-- Migration: Allow Public Read Access
-- Date: 2026-02-14
-- Description: Updates RLS policies to allow unauthenticated users
--              to view markets, trades, profiles, and probability history
-- ============================================

-- Remove old restrictive policies
DROP POLICY IF EXISTS "Approved users can read markets" ON public.markets;
DROP POLICY IF EXISTS "Approved users can view trades" ON public.trades;
DROP POLICY IF EXISTS "Approved users can view probability history" ON public.probability_history;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- ============================================
-- PROFILES: Allow public viewing (for leaderboard)
-- ============================================
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Keep update policy for authenticated users
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================
-- MARKETS: Allow public viewing
-- ============================================
CREATE POLICY "Anyone can read markets"
  ON public.markets FOR SELECT
  USING (true);

CREATE POLICY "Admins can create markets"
  ON public.markets FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update markets"
  ON public.markets FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================
-- TRADES: Allow public viewing
-- ============================================
CREATE POLICY "Anyone can view trades"
  ON public.trades FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE: only via execute_trade/execute_sell functions

-- ============================================
-- PROBABILITY_HISTORY: Allow public viewing
-- ============================================
CREATE POLICY "Anyone can view probability history"
  ON public.probability_history FOR SELECT
  USING (true);

-- ============================================
-- POSITIONS: Keep restricted to own positions
-- ============================================
-- Positions remain private - users can only see their own

-- ============================================
-- Verification
-- ============================================
-- After running this migration, verify with:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
