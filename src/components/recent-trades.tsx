import Link from "next/link";
import { formatLeaves, formatShares, formatProbability, timeAgo } from "@/lib/utils";
import type { Trade } from "@/lib/types";

interface RecentTradesProps {
  trades: (Trade & {
    profiles?: { username: string };
    markets?: { question: string } | null;
  })[];
  /** When true, show compact "bought YES on [question]..." (for homepage) */
  compact?: boolean;
}

export default function RecentTrades({ trades, compact = false }: RecentTradesProps) {
  if (!trades || trades.length === 0) {
    return (
      <div className="border-b border-border py-4">
        <Link href="/trades" className="text-sm font-medium text-foreground hover:text-accent transition-colors mb-3 inline-block">Recent Trades</Link>
        <p className="text-sm text-muted">No trades yet.</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="border-b border-border py-4">
        <Link href="/trades" className="text-sm font-medium text-foreground hover:text-accent transition-colors mb-3 inline-block">Recent Trades</Link>
        <div className="space-y-2">
          {trades.slice(0, 12).map((trade) => {
            const user = trade.profiles?.username ?? "Someone";
            const question = trade.markets?.question ?? "a market";
            const action = trade.type === "BUY" ? "bought" : "sold";
            return (
              <div
                key={trade.id}
                className="text-sm py-1.5 border-b border-border/50 last:border-0 min-w-0"
              >
                <Link
                  href={`/profile/${user}`}
                  className="text-foreground hover:text-accent transition-colors"
                >
                  {user}
                </Link>
                <span className="text-foreground"> {action} </span>
                <span className={trade.outcome === "YES" ? "text-yes font-semibold" : "text-no font-semibold"}>
                  {trade.outcome}
                </span>
                <span className="text-foreground"> on </span>
                <Link
                  href={`/markets/${trade.market_id}`}
                  className="text-foreground hover:text-accent transition-colors"
                >
                  {question}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border py-4">
      <h3 className="text-sm text-muted mb-3">Recent Trades</h3>
      <div className="space-y-2">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0"
          >
            <div className="flex items-center gap-2">
              <Link
                href={`/profile/${trade.profiles?.username ?? "User"}`}
                className="text-muted text-xs hover:text-accent transition-colors"
              >
                {trade.profiles?.username ?? "User"}
              </Link>
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
              <span>{formatLeaves(trade.amount)} 🍃</span>
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
