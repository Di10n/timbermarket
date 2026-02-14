-- ============================================
-- Comments on markets
-- ============================================

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_market ON public.comments(market_id, created_at DESC);

-- ============================================
-- RLS policies for comments
-- ============================================

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view comments"
  ON public.comments FOR SELECT
  USING (public.is_approved());

CREATE POLICY "Approved users can create own comments"
  ON public.comments FOR INSERT
  WITH CHECK (public.is_approved() AND user_id = auth.uid());

CREATE POLICY "Admins can delete comments"
  ON public.comments FOR DELETE
  USING (public.is_admin());

-- ============================================
-- Allow approved users to view all positions
-- (needed for displaying commenter stakes)
-- ============================================

CREATE POLICY "Approved users can view all positions"
  ON public.positions FOR SELECT
  USING (public.is_approved());
