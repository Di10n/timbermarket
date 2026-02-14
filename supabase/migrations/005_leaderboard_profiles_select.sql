-- Allow approved users to read all profiles (for leaderboard)
CREATE POLICY "Approved users can view all profiles for leaderboard"
  ON public.profiles FOR SELECT
  USING (public.is_approved());
