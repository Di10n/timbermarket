import Link from "next/link";
import { formatLeaves, formatShares, formatProbability, timeAgo } from "@/lib/utils";
import type { Trade } from "@/lib/types";
import LeafIcon from "@/components/leaf-icon";

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
    if (compact) {
      return (
        <div className="border-b border-border py-4">
          <span className="text-sm font-medium text-foreground mb-3 inline-block">Recent Trades</span>
          <p className="text-sm text-muted">No trades yet.</p>
        </div>
      );
    }
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-muted mb-3">Recent Trades</h3>
        <p className="text-sm text-muted">No trades yet.</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="border-b border-border py-4">
        <span className="text-sm font-medium text-foreground mb-3 inline-block">Recent Trades</span>
        <div className="space-y-2">
          {trades.slice(0, 12).map((trade) => {
            const user = trade.profiles?.username ?? "Someone";
            const question = trade.markets?.question ?? "a market";
            const action = trade.type === "BUY" ? "bought" : trade.type === "REDEEM" ? "redeemed" : "sold";
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
                {trade.type === "REDEEM" ? (
                  <span className="text-accent font-semibold">pairs</span>
                ) : (
                  <span className={trade.outcome === "YES" ? "text-yes font-semibold" : "text-no font-semibold"}>
                    {trade.outcome}
                  </span>
                )}
                <span className="text-foreground"> on </span>
                <Link
                  href={`/markets/${trade.market_id}`}
                  className="text-foreground hover:text-accent transition-colors"
                >
                  {question}
                </Link>
                <span className="text-muted"> · {formatLeaves(trade.amount)} <LeafIcon /></span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-muted mb-3">Recent Trades</h3>
      <div className="space-y-2">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center justify-between text-xs py-2 border-b border-border/50 last:border-0 gap-1 min-w-0"
          >
            <div className="flex items-center gap-1.5 min-w-0 shrink">
              <Link
                href={`/profile/${trade.profiles?.username ?? "User"}`}
                className="text-muted hover:text-accent transition-colors truncate"
              >
                {trade.profiles?.username ?? "User"}
              </Link>
              <span
                className={`font-medium whitespace-nowrap ${
                  trade.type === "BUY" ? "text-foreground" : trade.type === "REDEEM" ? "text-accent" : "text-muted"
                }`}
              >
                {trade.type === "BUY" ? "bought" : trade.type === "REDEEM" ? "redeemed" : "sold"}
              </span>
              {trade.type === "REDEEM" ? (
                <span className="text-accent whitespace-nowrap">pairs</span>
              ) : (
                <span
                  className={`whitespace-nowrap ${
                    trade.outcome === "YES" ? "text-yes" : "text-no"
                  }`}
                >
                  {trade.outcome}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 text-muted shrink-0">
              <span className="whitespace-nowrap inline-flex items-center gap-0.5">{formatLeaves(trade.amount)} <LeafIcon /></span>
              <span className="whitespace-nowrap hidden sm:inline">{formatShares(trade.shares)} shares</span>
              <span className="whitespace-nowrap hidden md:inline">
                {formatProbability(trade.prob_before)} →{" "}
                {formatProbability(trade.prob_after)}
              </span>
              <span className="whitespace-nowrap hidden lg:inline">{timeAgo(trade.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
