import { createClient, createServiceClient } from '@/lib/supabase/server';
import { formatLeaves } from '@/lib/utils';
import { LeaderboardEntry } from './leaderboard-entry';
import LeafIcon from '@/components/leaf-icon';

export const dynamic = 'force-dynamic';

interface UserPosition {
  market_id: string;
  market_question: string;
  yes_shares: number;
  no_shares: number;
  market_probability: number;
}

interface LeaderboardData {
  id: string;
  username: string;
  balance: number;
  portfolio_value: number;
  positions: UserPosition[];
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch all approved users with their balances
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, balance')
    .eq('is_approved', true);

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Leaderboard</h1>
        <p className="text-red-500">Failed to load leaderboard</p>
      </div>
    );
  }

  // Fetch all positions with market data using service client to bypass RLS
  const { data: positions, error: positionsError } = await serviceClient
    .from('positions')
    .select(
      `
      user_id,
      market_id,
      yes_shares,
      no_shares,
      markets (
        question,
        probability,
        status
      )
    `
    )
    .or('yes_shares.gt.0,no_shares.gt.0');

  if (positionsError) {
    console.error('Error fetching positions:', positionsError);
  }

  // Calculate portfolio values for each user
  const leaderboard: LeaderboardData[] = (profiles || []).map((profile) => {
    const userPositions = (positions || [])
      .filter((pos: any) => pos.user_id === profile.id && pos.markets?.status === 'active')
      .map((pos: any) => ({
        market_id: pos.market_id,
        market_question: pos.markets?.question || 'Unknown Market',
        yes_shares: pos.yes_shares,
        no_shares: pos.no_shares,
        market_probability: pos.markets?.probability || 0.5,
      }));

    // Calculate total value of positions
    const positionsValue = userPositions.reduce((sum, pos) => {
      const yesValue = pos.yes_shares * pos.market_probability;
      const noValue = pos.no_shares * (1 - pos.market_probability);
      return sum + yesValue + noValue;
    }, 0);

    return {
      id: profile.id,
      username: profile.username,
      balance: profile.balance,
      portfolio_value: profile.balance + positionsValue,
      positions: userPositions,
    };
  });

  // Sort by portfolio value (descending)
  leaderboard.sort((a, b) => b.portfolio_value - a.portfolio_value);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2"><LeafIcon /> Leaderboard</h1>
        <p className="text-sm text-muted">
          Verified users ranked by total portfolio value (balance + positions)
        </p>
      </div>

      {leaderboard.length === 0 ? (
        <p className="text-muted py-8 text-center">
          No users on the leaderboard yet
        </p>
      ) : (
        <div className="border-t border-border">
          {leaderboard.map((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = entry.id === user?.id;

            return (
              <LeaderboardEntry
                key={entry.id}
                rank={rank}
                username={entry.username}
                balance={entry.balance}
                portfolioValue={entry.portfolio_value}
                positions={entry.positions}
                isCurrentUser={isCurrentUser}
              />
            );
          })}
        </div>
      )}

      {/* Footer stats */}
      {leaderboard.length > 0 && (
        <div className="border-t border-border mt-8">
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="py-4 px-2 text-center">
              <div className="text-2xl font-bold text-foreground">{leaderboard.length}</div>
              <div className="text-xs text-muted">Verified Users</div>
            </div>
            <div className="py-4 px-2 text-center">
              <div className="text-2xl font-bold text-foreground">
                {formatLeaves(
                  leaderboard.reduce((sum, entry) => sum + entry.balance, 0)
                )} <LeafIcon />
              </div>
              <div className="text-xs text-muted">Total Balance</div>
            </div>
            <div className="py-4 px-2 text-center">
              <div className="text-2xl font-bold text-foreground">
                {formatLeaves(
                  leaderboard.reduce(
                    (sum, entry) => sum + entry.portfolio_value,
                    0
                  ) / leaderboard.length
                )} <LeafIcon />
              </div>
              <div className="text-xs text-muted">Avg Portfolio</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
