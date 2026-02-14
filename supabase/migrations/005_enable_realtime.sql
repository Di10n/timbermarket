-- Enable Supabase Realtime for trades and markets tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.markets;
