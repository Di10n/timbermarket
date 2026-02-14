-- Return total trade count per market (for featured market selection)
CREATE OR REPLACE FUNCTION public.get_market_trade_counts()
RETURNS TABLE(market_id uuid, trade_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT trades.market_id, COUNT(*)::bigint
  FROM public.trades
  GROUP BY trades.market_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_market_trade_counts() TO anon;
GRANT EXECUTE ON FUNCTION public.get_market_trade_counts() TO authenticated;
