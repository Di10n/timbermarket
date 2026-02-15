-- ============================================
-- Migration 023: Restrict trade functions to service_role only
--
-- SECURITY FIX: Migration 019 added auth.uid() checks inside
-- execute_trade and execute_sell but still granted EXECUTE to
-- the `authenticated` role. This allowed any authenticated user
-- to call these SECURITY DEFINER functions directly via the
-- Supabase REST API (PostgREST), bypassing the Next.js API
-- route entirely.
--
-- While the auth.uid() check prevents passing a *different*
-- user's ID, defense-in-depth requires removing direct access:
-- there is no legitimate reason for client-side code to call
-- these functions directly. All trades must go through
-- /api/trade, which authenticates the user and calls via
-- service_role.
--
-- This migration revokes EXECUTE from `authenticated` on
-- execute_trade, execute_sell, and verify_qr_code, leaving
-- only service_role able to invoke them.
-- ============================================

-- execute_trade: only callable via /api/trade (service_role)
REVOKE EXECUTE ON FUNCTION public.execute_trade(uuid, uuid, text, numeric) FROM authenticated;

-- execute_sell: only callable via /api/trade (service_role)
REVOKE EXECUTE ON FUNCTION public.execute_sell(uuid, uuid, text, numeric) FROM authenticated;

-- verify_qr_code: only callable via /api/verify-phone/* (service_role)
REVOKE EXECUTE ON FUNCTION public.verify_qr_code(uuid, text) FROM authenticated;
