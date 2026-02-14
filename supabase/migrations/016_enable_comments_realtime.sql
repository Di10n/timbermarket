-- Enable Supabase Realtime for comments table (for TV page chat feed)
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
