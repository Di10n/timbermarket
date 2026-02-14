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
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-6">Recent Trades</h1>
        <p className="text-no">Failed to load trades</p>
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
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Recent Trades</h1>
        <p className="text-sm text-muted">
          Latest trading activity across all markets
        </p>
      </div>

      {typedTrades.length === 0 ? (
        <p className="text-muted py-8 text-center">
          No trades yet
        </p>
      ) : (
        <div className="border-t border-border">
          {typedTrades.map((trade) => {
            const probChange = trade.prob_after - trade.prob_before;
            const isProbUp = probChange > 0;

            return (
              <div
                key={trade.id}
                className="flex items-center gap-4 py-3 px-2 border-b border-border hover:bg-card-hover/30 transition-colors"
              >
                {/* Trade Type Badge */}
                <div className="shrink-0">
                  <span
                    className={`text-xs px-1.5 py-0.5 ${
                      trade.type === 'BUY'
                        ? 'bg-yes/10 text-yes'
                        : 'bg-no/10 text-no'
                    }`}
                  >
                    {trade.type}
                  </span>
                </div>

                {/* Outcome Badge */}
                <div className="shrink-0">
                  <span
                    className={
                      trade.outcome === 'YES' ? 'text-yes text-sm' : 'text-no text-sm'
                    }
                  >
                    {trade.outcome}
                  </span>
                </div>

                {/* User */}
                <div className="shrink-0 min-w-0">
                  <Link
                    href={`/profile/${trade.user.username}`}
                    className="text-sm font-medium text-foreground hover:text-accent transition-colors truncate block"
                  >
                    {trade.user.username}
                  </Link>
                </div>

                {/* Market */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/markets/${trade.market.id}`}
                    className="text-sm text-muted hover:text-foreground transition-colors truncate block"
                  >
                    {trade.market.question}
                  </Link>
                </div>

                {/* Amount & Shares */}
                <div className="shrink-0 text-right">
                  <div className="text-sm font-medium text-foreground">
                    {formatLeaves(trade.amount)}
                  </div>
                  <div className="text-xs text-muted">
                    {trade.shares.toFixed(2)} shares
                  </div>
                </div>

                {/* Probability Change */}
                <div className="shrink-0 text-right min-w-[80px]">
                  <div className="text-sm font-mono text-foreground">
                    {(trade.prob_before * 100).toFixed(1)}%{' '}
                    <span className="text-muted">→</span>{' '}
                    {(trade.prob_after * 100).toFixed(1)}%
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      isProbUp ? 'text-yes' : 'text-no'
                    }`}
                  >
                    {isProbUp ? '↑' : '↓'}{' '}
                    {Math.abs(probChange * 100).toFixed(1)}%
                  </div>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right min-w-[60px]">
                  <span className="text-xs text-muted">
                    {timeAgo(trade.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted mt-8 text-center">
        <Link href="/" className="hover:text-foreground transition-colors">
          Back to home
        </Link>
      </p>
    </div>
  );
}
