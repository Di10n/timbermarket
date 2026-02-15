"use client";

import Link from "next/link";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market } from "@/lib/types";
import { useRouter } from "next/navigation";
import { getFpmmProbabilities } from "@/lib/fpmm";

export default function MarketCard({
  market,
  traderCount,
  commentCount = 0,
}: {
  market: Market;
  traderCount?: number;
  commentCount?: number;
}) {
  const router = useRouter();
  const isResolved = market.status === "resolved";
  const isMultiOutcome = market.market_type === 'multi';

  // Calculate probabilities
  let probabilities: Record<string, number> = {};
  if (isMultiOutcome && market.outcome_pools) {
    probabilities = getFpmmProbabilities(market.outcome_pools);
  } else {
    probabilities = {
      'YES': market.probability,
      'NO': 1 - market.probability,
    };
  }

  const prob = market.probability;
  const probPercent = Math.round(prob * 100);

  const handleOutcomeClick = (outcome: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isResolved) router.push(`/markets/${market.id}?outcome=${outcome}`);
  };

  return (
    <Link href={`/markets/${market.id}`}>
      <div className={`bg-card border rounded-2xl p-6 hover:shadow-lg transition-all cursor-pointer ${isResolved ? "border-border/50" : "border-border hover:border-accent/30"}`}>
        {/* Header with question */}
        <div className={`mb-6 ${isResolved ? "opacity-40" : ""}`}>
          <h3 className={`font-semibold text-lg leading-snug line-clamp-2 mb-3 ${isResolved ? "text-muted" : "text-foreground"}`}>
            {market.question}
          </h3>

          {/* Probability display */}
          {isMultiOutcome ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {market.outcomes?.slice(0, 4).map((outcome) => (
                <div key={outcome} className="flex justify-between items-center">
                  <span className="truncate text-muted">{outcome}</span>
                  <span className="font-semibold ml-2">{formatProbability(probabilities[outcome] || 0)}</span>
                </div>
              ))}
              {market.outcomes && market.outcomes.length > 4 && (
                <div className="col-span-2 text-xs text-muted text-center">
                  +{market.outcomes.length - 4} more
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                {/* Background circle */}
                <div className="absolute inset-0 rounded-full border-4 border-border"></div>
                {/* Progress circle */}
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke={isResolved ? "rgb(107, 114, 128)" : prob >= 0.5 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                    strokeWidth="4"
                    strokeDasharray={`${2 * Math.PI * 36}`}
                    strokeDashoffset={`${2 * Math.PI * 36 * (1 - prob)}`}
                    className="transition-all duration-500"
                  />
                </svg>
                {/* Percentage text */}
                <div className={`relative z-10 text-2xl font-bold ${isResolved ? "text-muted" : "text-foreground"}`}>
                  {probPercent}%
                </div>
              </div>
              <span className="text-xs text-muted ml-2">chance</span>
            </div>
          )}
        </div>

        {/* Buttons or Resolution banner */}
        <div className="flex gap-3 mb-4">
          {isResolved ? (
            <div className={`flex-1 rounded-xl py-4 text-center border ${
              !isMultiOutcome && market.resolution === "YES"
                ? "bg-yes/10 border-yes/30"
                : !isMultiOutcome && market.resolution === "NO"
                  ? "bg-no/10 border-no/30"
                  : "bg-muted/10 border-border"
            }`}>
              <span className="text-sm font-semibold uppercase tracking-wider text-muted">Resolved </span>
              <span className={`text-lg font-bold ${
                !isMultiOutcome && market.resolution === "YES"
                  ? "text-yes"
                  : !isMultiOutcome && market.resolution === "NO"
                    ? "text-no"
                    : "text-foreground"
              }`}>
                {market.resolution ?? "—"}
              </span>
            </div>
          ) : !isMultiOutcome ? (
            <>
              <button
                onClick={handleOutcomeClick('YES')}
                className="flex-1 bg-yes/10 hover:bg-yes/20 border border-yes/30 rounded-xl py-4 text-center transition-colors"
              >
                <span className="text-yes font-semibold text-lg">Buy Yes</span>
              </button>
              <button
                onClick={handleOutcomeClick('NO')}
                className="flex-1 bg-no/10 hover:bg-no/20 border border-no/30 rounded-xl py-4 text-center transition-colors"
              >
                <span className="text-no font-semibold text-lg">Buy No</span>
              </button>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/markets/${market.id}`);
              }}
              className="flex-1 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-xl py-4 text-center transition-colors"
            >
              <span className="text-accent font-semibold text-lg">View Market</span>
            </button>
          )}
        </div>

        {/* Footer with volume, time, and comments */}
        <div className={`flex items-center gap-3 text-sm text-muted truncate ${isResolved ? "opacity-40" : ""}`}>
          <span className="font-medium shrink-0">{formatLeaves(market.volume)} Vol.</span>
          {traderCount != null && (
            <>
              <span className="shrink-0">•</span>
              <span className="shrink-0">{traderCount} {traderCount === 1 ? "trader" : "traders"}</span>
            </>
          )}
          <span className="shrink-0">•</span>
          <span className="shrink-0">{timeAgo(market.created_at)}</span>
          <span className="shrink-0">•</span>
          <span className="truncate">{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </Link>
  );
}
