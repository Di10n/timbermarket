-- Leaderboard: returns top profiles by balance (bypasses RLS for approved users)
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit int DEFAULT 10)
RETURNS TABLE(username text, balance numeric) AS $$
BEGIN
  IF NOT public.is_approved() THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.username, p.balance
  FROM public.profiles p
  ORDER BY p.balance DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
