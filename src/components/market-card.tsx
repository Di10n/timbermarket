import Link from "next/link";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market } from "@/lib/types";

export default function MarketCard({ market }: { market: Market }) {
  const prob = market.probability;

  return (
    <Link href={`/markets/${market.id}`} className="block">
      <div className="border-b border-border py-5 px-2 hover:bg-card-hover/30 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-foreground font-medium text-sm leading-snug flex-1">
            {market.question}
          </h3>
          <div
            className={`text-2xl font-bold shrink-0 ${
              prob >= 0.5 ? "text-yes" : "text-no"
            }`}
          >
            {formatProbability(prob)}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs text-muted">
          <span>{formatLeaves(market.volume)} traded</span>
          <span>{timeAgo(market.created_at)}</span>
          {market.status === "resolved" && (
            <span className="px-1.5 py-0.5 bg-border/50 rounded text-foreground">
              Resolved {market.resolution}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
