import { createClient } from '@/lib/supabase/server';
import { formatLeaves } from '@/lib/utils';
import Link from 'next/link';
import { LeaderboardEntry } from './leaderboard-entry';

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

  // Fetch all positions with market data
  const { data: positions, error: positionsError } = await supabase
    .from('positions')
    .select(
      `
      user_id,
      market_id,
      yes_shares,
      no_shares,
      markets (
        question,
        probability
      )
    `
    )
    .gt('yes_shares', 0)
    .or('yes_shares.gt.0,no_shares.gt.0');

  if (positionsError) {
    console.error('Error fetching positions:', positionsError);
  }

  // Calculate portfolio values for each user
  const leaderboard: LeaderboardData[] = (profiles || []).map((profile) => {
    const userPositions = (positions || [])
      .filter((pos: any) => pos.user_id === profile.id)
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
        <p className="text-muted-foreground mb-6">
          Top users ranked by total portfolio value (balance + positions)
        </p>

        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No users on the leaderboard yet
          </div>
        ) : (
          <div className="space-y-2">
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
          <div className="mt-8 p-4 bg-muted rounded-lg">
            <div className="flex justify-around text-center">
              <div>
                <div className="text-2xl font-bold">{leaderboard.length}</div>
                <div className="text-sm text-muted-foreground">Total Users</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {formatLeaves(
                    leaderboard.reduce((sum, entry) => sum + entry.balance, 0)
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Balance
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {formatLeaves(
                    leaderboard.reduce(
                      (sum, entry) => sum + entry.portfolio_value,
                      0
                    ) / leaderboard.length
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Avg Portfolio
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Back to markets link */}
        <div className="mt-6 text-center">
          <Link href="/markets" className="text-primary hover:underline">
            ← Back to Markets
          </Link>
        </div>
      </div>
    </div>
  );
}
