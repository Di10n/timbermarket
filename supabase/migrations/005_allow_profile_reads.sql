-- Allow approved users to view all profiles (e.g. usernames in trade history)
CREATE POLICY "Approved users can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_approved());
