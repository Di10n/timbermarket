import { formatLeaves, formatShares, formatProbability, timeAgo } from "@/lib/utils";
import type { Trade } from "@/lib/types";

interface RecentTradesProps {
  trades: (Trade & { profiles?: { username: string } })[];
}

export default function RecentTrades({ trades }: RecentTradesProps) {
  if (!trades || trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm text-muted mb-3">Recent Trades</h3>
        <p className="text-sm text-muted">No trades yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm text-muted mb-3">Recent Trades</h3>
      <div className="space-y-2">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted text-xs">
                {trade.profiles?.username ?? "User"}
              </span>
              <span
                className={`font-medium ${
                  trade.type === "BUY" ? "text-foreground" : "text-muted"
                }`}
              >
                {trade.type === "BUY" ? "bought" : "sold"}
              </span>
              <span
                className={
                  trade.outcome === "YES" ? "text-yes" : "text-no"
                }
              >
                {trade.outcome}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>{formatLeaves(trade.amount)} leaves</span>
              <span>{formatShares(trade.shares)} shares</span>
              <span>
                {formatProbability(trade.prob_before)} →{" "}
                {formatProbability(trade.prob_after)}
              </span>
              <span>{timeAgo(trade.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
