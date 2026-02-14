-- ============================================
-- Timbermarket Database Schema
-- ============================================

-- Profiles: extends auth.users with app-specific data
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_approved boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, balance, is_approved, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    0,
    false,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Approved codes: SHA-256 hashes for QR verification
CREATE TABLE public.approved_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text UNIQUE NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES public.profiles(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Markets
CREATE TABLE public.markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  description text,
  creator_id uuid NOT NULL REFERENCES public.profiles(id),
  pool_yes numeric NOT NULL,
  pool_no numeric NOT NULL,
  p numeric NOT NULL,
  probability numeric NOT NULL,
  total_liquidity numeric NOT NULL DEFAULT 0,
  volume numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trades: immutable ledger
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL CHECK (type IN ('BUY', 'SELL')),
  outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  amount numeric NOT NULL CHECK (amount > 0),
  shares numeric NOT NULL CHECK (shares > 0),
  prob_before numeric NOT NULL,
  prob_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trades_market ON public.trades(market_id, created_at DESC);
CREATE INDEX idx_trades_user ON public.trades(user_id, created_at DESC);

-- Positions: aggregated per-user-per-market
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  yes_shares numeric NOT NULL DEFAULT 0,
  no_shares numeric NOT NULL DEFAULT 0,
  total_invested numeric NOT NULL DEFAULT 0,
  UNIQUE(user_id, market_id)
);

CREATE INDEX idx_positions_user ON public.positions(user_id);

-- Probability history: time series for charts
CREATE TABLE public.probability_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  probability numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prob_history ON public.probability_history(market_id, created_at);
