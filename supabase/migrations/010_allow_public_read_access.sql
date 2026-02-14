-- ============================================
-- Allow public read access to key tables
-- ============================================

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Approved users can read markets" ON public.markets;
DROP POLICY IF EXISTS "Approved users can view trades" ON public.trades;
DROP POLICY IF EXISTS "Approved users can view probability history" ON public.probability_history;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own username" ON public.profiles;
DROP POLICY IF EXISTS "Admins can create markets" ON public.markets;
DROP POLICY IF EXISTS "Admins can update markets" ON public.markets;

-- ============================================
-- profiles: Public can view basic info
-- ============================================
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own username"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================
-- markets: Public read access
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
-- trades: Public read access
-- ============================================
CREATE POLICY "Anyone can view trades"
  ON public.trades FOR SELECT
  USING (true);

-- ============================================
-- probability_history: Public read access
-- ============================================
CREATE POLICY "Anyone can view probability history"
  ON public.probability_history FOR SELECT
  USING (true);
