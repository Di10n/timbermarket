-- Add phone_number column to profiles
ALTER TABLE public.profiles
  ADD COLUMN phone_number text UNIQUE;

-- Drop QR code verification function
DROP FUNCTION IF EXISTS public.verify_qr_code(uuid, text);

-- Drop approved_codes table
DROP TABLE IF EXISTS public.approved_codes;
