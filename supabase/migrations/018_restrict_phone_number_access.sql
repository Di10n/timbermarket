-- ============================================
-- Lock down profiles table grants
-- ============================================
-- Problem: table-level grants let any authenticated user UPDATE any column
-- on their own profile row (RLS only gates row access, not columns).
-- This allowed users to set is_admin=true, is_approved=true, balance=X
-- by calling supabase.from('profiles').update({...}) directly.
--
-- Fix: revoke broad table-level grants and re-grant only the specific
-- columns each role needs. API routes that need full access use the
-- service role client, which bypasses these grants.

-- ============================================
-- SELECT: restrict to non-PII columns
-- ============================================
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT (id, username, balance, is_approved, is_admin, created_at) ON public.profiles TO anon;
GRANT SELECT (id, username, balance, is_approved, is_admin, created_at) ON public.profiles TO authenticated;

-- ============================================
-- UPDATE: only allow username changes
-- ============================================
-- Revoke table-level UPDATE so column-level grant takes effect
REVOKE UPDATE ON public.profiles FROM anon;
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Only allow authenticated users to update their own username (row gated by RLS)
GRANT UPDATE (username) ON public.profiles TO authenticated;

-- ============================================
-- INSERT / DELETE: disallow direct client access
-- ============================================
-- Profiles are created by the handle_new_user() trigger (SECURITY DEFINER).
-- Deletions cascade from auth.users. No direct client access needed.
REVOKE INSERT ON public.profiles FROM anon;
REVOKE INSERT ON public.profiles FROM authenticated;
REVOKE DELETE ON public.profiles FROM anon;
REVOKE DELETE ON public.profiles FROM authenticated;
