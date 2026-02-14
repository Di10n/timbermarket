-- Allow admin to choose which market is featured on the TV page
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- At most one market can be featured (partial unique index on constant).
CREATE UNIQUE INDEX idx_markets_single_featured
  ON public.markets ((true))
  WHERE is_featured = true;

COMMENT ON COLUMN public.markets.is_featured IS 'When true, this market is shown as featured on the TV page. Only one should be true; admin API enforces this.';
