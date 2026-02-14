import Link from "next/link";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import ProbabilitySparkline from "@/components/probability-sparkline";
import type { Market } from "@/lib/types";

export interface ProbabilityPoint {
  probability: number;
  created_at: string;
}

interface MarketCarouselCardProps {
  market: Market;
  history?: ProbabilityPoint[];
}

export default function MarketCarouselCard({ market, history }: MarketCarouselCardProps) {
  const prob = market.probability;

  return (
    <Link href={`/markets/${market.id}`} className="block h-full w-full">
      <div
        className="bg-card border border-border p-4 hover:border-border/80 hover:bg-card-hover transition-colors h-full w-full flex flex-col min-h-0 aspect-[4/1]"
        style={{ minHeight: 52 }}
      >
        <div className="flex items-start justify-between gap-4 shrink-0">
          <h3 className="text-foreground font-medium text-sm leading-snug flex-1 min-w-0">
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

        <div className="flex-1 relative min-h-0 mt-1">
          <div className="absolute inset-0 overflow-hidden">
            {history && history.length > 0 ? (
              <ProbabilitySparkline data={history} compact />
            ) : null}
          </div>
          <div className="absolute bottom-0 left-0 flex items-center gap-3 text-xs text-muted">
            <span>{formatLeaves(market.volume)} traded</span>
            <span>{timeAgo(market.created_at)}</span>
            {market.status === "resolved" && (
              <span className="px-1.5 py-0.5 bg-border/50 text-foreground">
                Resolved {market.resolution}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
