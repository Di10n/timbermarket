import { createClient } from '@/lib/supabase/server';
import { formatLeaves, timeAgo } from '@/lib/utils';
import Link from 'next/link';

interface Trade {
  id: string;
  type: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  amount: number;
  shares: number;
  prob_before: number;
  prob_after: number;
  created_at: string;
  user: {
    username: string;
  };
  market: {
    id: string;
    question: string;
  };
}

export default async function TradesPage() {
  const supabase = await createClient();

  // Fetch recent trades with user and market data
  const { data: trades, error } = await supabase
    .from('trades')
    .select(
      `
      id,
      type,
      outcome,
      amount,
      shares,
      prob_before,
      prob_after,
      created_at,
      profiles!trades_user_id_fkey (username),
      markets (id, question)
    `
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching trades:', error);
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Recent Trades</h1>
        <p className="text-red-500">Failed to load trades</p>
      </div>
    );
  }

  const typedTrades: Trade[] =
    trades?.map((trade: any) => ({
      id: trade.id,
      type: trade.type,
      outcome: trade.outcome,
      amount: trade.amount,
      shares: trade.shares,
      prob_before: trade.prob_before,
      prob_after: trade.prob_after,
      created_at: trade.created_at,
      user: {
        username: trade.profiles?.username || 'Unknown',
      },
      market: {
        id: trade.markets?.id || '',
        question: trade.markets?.question || 'Unknown Market',
      },
    })) || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Recent Trades</h1>
        <p className="text-muted-foreground mb-6">
          Latest trading activity across all markets
        </p>

        {typedTrades.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No trades yet
          </div>
        ) : (
          <div className="space-y-2">
            {typedTrades.map((trade) => {
              const probChange = trade.prob_after - trade.prob_before;
              const isProbUp = probChange > 0;

              return (
                <div
                  key={trade.id}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card border-border hover:bg-muted/50 transition-colors"
                >
                  {/* Trade Type Badge */}
                  <div className="flex-shrink-0">
                    <div
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.type === 'BUY'
                          ? 'bg-green-500/20 text-green-600'
                          : 'bg-red-500/20 text-red-600'
                      }`}
                    >
                      {trade.type}
                    </div>
                  </div>

                  {/* Outcome Badge */}
                  <div className="flex-shrink-0">
                    <div
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.outcome === 'YES'
                          ? 'bg-blue-500/20 text-blue-600'
                          : 'bg-orange-500/20 text-orange-600'
                      }`}
                    >
                      {trade.outcome}
                    </div>
                  </div>

                  {/* User */}
                  <div className="flex-shrink-0 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {trade.user.username}
                    </span>
                  </div>

                  {/* Market */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/markets/${trade.market.id}`}
                      className="text-sm hover:text-primary transition-colors truncate block"
                    >
                      {trade.market.question}
                    </Link>
                  </div>

                  {/* Amount & Shares */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-semibold">
                      {formatLeaves(trade.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {trade.shares.toFixed(2)} shares
                    </div>
                  </div>

                  {/* Probability Change */}
                  <div className="flex-shrink-0 text-right min-w-[80px]">
                    <div className="text-sm font-mono">
                      {(trade.prob_before * 100).toFixed(1)}%{' '}
                      <span className="text-muted-foreground">→</span>{' '}
                      {(trade.prob_after * 100).toFixed(1)}%
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        isProbUp ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {isProbUp ? '↑' : '↓'}{' '}
                      {Math.abs(probChange * 100).toFixed(1)}%
                    </div>
                  </div>

                  {/* Time */}
                  <div className="flex-shrink-0 text-right min-w-[60px]">
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(trade.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
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
