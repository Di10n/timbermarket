-- ============================================
-- Row Level Security Policies
-- ============================================

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_approved FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- profiles
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own username"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================
-- approved_codes: no direct client access
-- ============================================
ALTER TABLE public.approved_codes ENABLE ROW LEVEL SECURITY;
-- All operations via verify_qr_code() SECURITY DEFINER function

-- ============================================
-- markets
-- ============================================
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can read markets"
  ON public.markets FOR SELECT
  USING (public.is_approved());

CREATE POLICY "Admins can create markets"
  ON public.markets FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update markets"
  ON public.markets FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================
-- trades
-- ============================================
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view trades"
  ON public.trades FOR SELECT
  USING (public.is_approved());

-- No INSERT/UPDATE/DELETE: only via execute_trade/execute_sell functions

-- ============================================
-- positions
-- ============================================
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own positions"
  ON public.positions FOR SELECT
  USING (user_id = auth.uid() AND public.is_approved());

-- No INSERT/UPDATE/DELETE: only via execute_trade/execute_sell functions

-- ============================================
-- probability_history
-- ============================================
ALTER TABLE public.probability_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view probability history"
  ON public.probability_history FOR SELECT
  USING (public.is_approved());
