-- ============================================
-- Market Ideas (user-submitted suggestions)
-- ============================================

CREATE TABLE public.market_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) > 0 AND char_length(question) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_ideas_status ON public.market_ideas(status, created_at DESC);
CREATE INDEX idx_market_ideas_user ON public.market_ideas(user_id, created_at DESC);

-- ============================================
-- RLS policies for market_ideas
-- ============================================

ALTER TABLE public.market_ideas ENABLE ROW LEVEL SECURITY;

-- Approved users can submit their own ideas
CREATE POLICY "Approved users can submit ideas"
  ON public.market_ideas FOR INSERT
  WITH CHECK (public.is_approved() AND user_id = auth.uid());

-- Users can view their own ideas
CREATE POLICY "Users can view own ideas"
  ON public.market_ideas FOR SELECT
  USING (public.is_approved() AND user_id = auth.uid());

-- Admins can view all ideas
CREATE POLICY "Admins can view all ideas"
  ON public.market_ideas FOR SELECT
  USING (public.is_admin());

-- Admins can update idea status
CREATE POLICY "Admins can update ideas"
  ON public.market_ideas FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
