# Timbermarket - Prediction Market Platform
 
## Project Overview
Timbermarket is a prediction market platform built for TreeHacks 2026 hackathon. Users buy and sell shares on yes/no questions using an Automated Market Maker (AMM) algorithm. The platform uses "leaves" as its currency.

**Domain**: timbermarket.lol

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Deployment**: Vercel
- **Phone Verification**: Twilio Verify API
- **Charts**: Recharts

## Branch Strategy
- **Main branch**: `main` (production)
- **Current development branch**: `gino`
- Development work happens on feature branches that merge into `main`
- Using shared Supabase dev database

## Core Features

### 1. Authentication & Onboarding
- Users sign up with username and password (no email)
- Synthetic email (`{username}@timbermarket.lol`) used internally for Supabase Auth
- Phone number verification via Twilio Verify API required for approval
- Approved users receive 1000 starting leaves
- Location: `src/app/(auth)/`

### 2. Markets
- List of active and resolved markets
- Each market is a yes/no question with probability
- Market detail page shows probability chart, trade panel, recent trades
- Location: `src/app/(app)/markets/`

### 3. Trading (Maniswap Algorithm)
- **Algorithm**: Maniswap CPMM (Constant Product Market Maker)
- **Invariant**: `k = y^p × n^(1-p)`
  - `y` = YES pool reserves
  - `n` = NO pool reserves
  - `p` = probability parameter
- **Probability**: `p_market = (p × n) / ((1-p) × y + p × n)`
- **Initial liquidity**: 500 units per market recommended
- **Atomicity**: All trades via `execute_trade()` and `execute_sell()` PostgreSQL functions with row locks
- Location: `src/lib/amm.ts` (client-side calculations), `supabase/migrations/003_create_functions.sql` (server-side execution)

### 4. Portfolio
- Shows user's balance and total portfolio value
- Toggle between positions and recent trades views
- Position value = YES shares × probability + NO shares × (1 - probability)
- Location: `src/app/(app)/portfolio/`

### 5. Leaderboard
- Ranks users by total portfolio value (balance + position values)
- Shows position breakdown per user
- Calculates portfolio value in real-time based on current market probabilities
- Location: `src/app/(app)/leaderboard/`

### 6. Admin Panel
- Restricted to users with `is_admin = true`
- Create new markets with initial probability and ante
- Resolve markets to: YES, NO, N/A, or percentage
- Location: `src/app/(app)/admin/`

## Database Schema

### Tables
- **profiles**: User accounts (balance, username, phone_number, is_admin, is_approved)
- **markets**: Questions, pool state, probability, status, resolution
- **trades**: Immutable ledger of all buy/sell actions
- **positions**: Aggregated per-user-per-market holdings
- **probability_history**: Time series for charts

### Key Functions (SECURITY DEFINER)
- `create_market(creator_id, question, description, initial_prob, ante)`: Create new market
- `execute_trade(user_id, market_id, outcome, amount)`: Atomic buy trade
- `execute_sell(user_id, market_id, outcome, shares)`: Atomic sell trade (binary search for cost)
- `resolve_market(market_id, resolution)`: Resolve market and distribute payouts

### Security
- RLS (Row Level Security) policies enabled
- All balance updates and trades are atomic via PostgreSQL functions
- User balance checks prevent negative balances
- Markets locked when not active (can't trade on resolved/cancelled markets)

## Key File Locations

### Frontend Components
- `src/components/navbar.tsx`: Navigation bar with balance display
- `src/components/market-card.tsx`: Market preview card
- `src/components/trade-panel.tsx`: Buy/sell interface
- `src/components/probability-chart.tsx`: Recharts-based probability history
- `src/components/admin-panel.tsx`: Admin controls

### API Routes
- `src/app/api/trade/route.ts`: Execute buy trades
- `src/app/api/auth/signup/route.ts`: Server-side signup (creates user with synthetic email)
- `src/app/api/verify-phone/send/route.ts`: Send phone verification OTP via Twilio
- `src/app/api/verify-phone/check/route.ts`: Verify phone OTP and approve user
- `src/app/api/admin/create-market/route.ts`: Create new market
- `src/app/api/admin/resolve-market/route.ts`: Resolve market

### Library Code
- `src/lib/amm.ts`: Maniswap algorithm implementation
- `src/lib/types.ts`: TypeScript interfaces
- `src/lib/supabase/server.ts`: Supabase server client
- `src/lib/supabase/client.ts`: Supabase client-side client
- `src/lib/utils.ts`: Utility functions (formatLeaves, etc.)

### Database
- `supabase/migrations/001_create_tables.sql`: Schema
- `supabase/migrations/002_create_rls_policies.sql`: RLS policies
- `supabase/migrations/003_create_functions.sql`: PostgreSQL functions
- `supabase/migrations/009_phone_verification.sql`: Phone number column, drops QR code tables

## TreeHacks Context

### Prize Tracks (14 total)
- AI Track (OpenAI)
- Cloud AI Track (Google)
- Edge AI Track (NVIDIA)
- Education Track (Zoom)
- Healthcare Track (OpenEvidence)
- Human Flourishing Track (Anthropic)
- Inference Track (Modal)
- Sustainability Track (Stanford Econpreneurship)
- Y Combinator Award

### Platform Use Cases
- Predict winners of prize tracks
- Predict project outcomes
- Team registration markets (200 bonus leaves for registering)

### Planned Features
- TV display route (`/tv`) for leaderboard and recent activity
- Market self-registration form for teams
- Slack notifications

## Development Workflow

### Running Locally
```bash
npm run dev  # Start dev server on localhost:3000
```

### Environment Variables
Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

### Deployment
- Deployed on Vercel
- Automatic deployments from `main` branch
- Preview deployments for PRs

## Implementation Notes

### Currency Display
- Use `formatLeaves()` utility to format leaf amounts
- Format: "1,234 leaves" or "1.2K leaves" for large numbers

### Real-time Updates
- Supabase Realtime enabled on `markets` and `trades` tables
- Probability history updates on every trade

### Trade Mechanics
- **Buying**: User spends leaves to get shares
- **Selling**: User sells shares back to AMM for leaves
- Shares have no intrinsic value until market resolves
- At resolution: YES shares worth 1 leaf each if YES, 0 if NO (and vice versa)

### Market Resolution
- **YES**: YES shareholders get 1 leaf per share
- **NO**: NO shareholders get 1 leaf per share
- **N/A**: All users refunded their `total_invested`
- **Percentage (0-1)**: Partial payout, e.g. 0.7 = YES shares worth 0.7 leaves, NO shares worth 0.3 leaves

## Current Status
- Core functionality implemented
- Leaderboard recently added
- Working on branch `gino`, will merge to `main`
- Shared dev database in use

## Style & UX
- Dark theme optimized for readability
- Minimalist design, focus on data
- Responsive for mobile and desktop
- Large fonts (3-4rem) planned for TV display

## References
- Maniswap Algorithm: https://manifoldmarkets.notion.site/Maniswap-ce406e1e897d417cbd491071ea8a0c39
- Manifold source: https://github.com/manifoldmarkets/manifold (see `common/src/calculate-cpmm.ts`)
