-- ============================================
-- Migration 022: Fix profile privilege escalation & lock down admin RPCs
--
-- CRITICAL SECURITY FIX:
--
-- 1. Migration 018 revoked UPDATE on profiles from `anon` and
--    `authenticated` but NOT from the `public` pseudo-role. Since all
--    PostgreSQL roles implicitly inherit from `public`, authenticated
--    users still had table-level UPDATE via inheritance, allowing them
--    to set is_admin=true, is_approved=true, or arbitrary balance values
--    on their own profile row (which the RLS policy permits).
--
-- 2. Migration 019 granted EXECUTE on create_market and resolve_market
--    to `authenticated`. These are admin-only operations with
--    corresponding API routes that check is_admin server-side before
--    calling the functions via service_role. Granting EXECUTE to
--    authenticated users was unnecessary and expanded the attack surface,
--    allowing direct RPC calls that only needed is_admin=true in the
--    profile (which exploit #1 provides).
--
-- Fixes:
-- A. Revoke UPDATE on profiles from `public` to close the inheritance
--    loophole. The column-level GRANT UPDATE (username) TO authenticated
--    from migration 018 then becomes the sole UPDATE permission.
-- B. Harden the RLS UPDATE policy on profiles so that even if column-
--    level grants are bypassed, is_admin/is_approved/balance cannot be
--    changed by the user.
-- C. Revoke EXECUTE on create_market and resolve_market from
--    authenticated. These functions can only be called via service_role
--    (through the API routes).
-- ============================================

-- ============================================
-- A. Close the public-role inheritance loophole
-- ============================================
REVOKE UPDATE ON public.profiles FROM public;

-- ============================================
-- B. Harden the RLS UPDATE policy on profiles
--    The WITH CHECK ensures that sensitive columns cannot be changed,
--    even if column-level grants are misconfigured. Subqueries read
--    pre-UPDATE values via MVCC, so any attempt to change a protected
--    column will fail the check.
-- ============================================
DROP POLICY IF EXISTS "Users can update own username" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
    AND is_approved = (SELECT p.is_approved FROM public.profiles p WHERE p.id = auth.uid())
    AND balance = (SELECT p.balance FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============================================
-- C. Revoke EXECUTE on admin-only functions from authenticated
--    Users must go through /api/admin/* routes, which verify admin
--    status server-side and call via service_role.
-- ============================================
REVOKE EXECUTE ON FUNCTION public.create_market(uuid, text, text, numeric, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_market(uuid, text) FROM authenticated;
