"use client";

import Link from "next/link";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function MarketCard({
  market,
  traderCount,
  commentCount = 0,
}: {
  market: Market;
  traderCount?: number;
  commentCount?: number;
}) {
  const prob = market.probability;
  const probPercent = Math.round(prob * 100);
  const router = useRouter();

  const handleYesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/markets/${market.id}?outcome=YES`);
  };

  const handleNoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/markets/${market.id}?outcome=NO`);
  };

  return (
    <Link href={`/markets/${market.id}`}>
      <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg hover:border-accent/30 transition-all cursor-pointer">
        {/* Header with question and probability */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <h3 className="text-foreground font-semibold text-lg leading-snug flex-1">
            {market.question}
          </h3>

          {/* Circular probability display */}
          <div className="flex flex-col items-center shrink-0">
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
                  stroke={prob >= 0.5 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - prob)}`}
                  className="transition-all duration-500"
                />
              </svg>
              {/* Percentage text */}
              <div className="relative z-10 text-2xl font-bold text-foreground">
                {probPercent}%
              </div>
            </div>
            <span className="text-xs text-muted mt-1">chance</span>
          </div>
        </div>

        {/* YES/NO Buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleYesClick}
            className="flex-1 bg-yes/10 hover:bg-yes/20 border border-yes/30 rounded-xl py-4 text-center transition-colors"
          >
            <span className="text-yes font-semibold text-lg">Buy Yes</span>
          </button>
          <button
            onClick={handleNoClick}
            className="flex-1 bg-no/10 hover:bg-no/20 border border-no/30 rounded-xl py-4 text-center transition-colors"
          >
            <span className="text-no font-semibold text-lg">Buy No</span>
          </button>
        </div>

        {/* Footer with volume, time, and comments */}
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="font-medium">{formatLeaves(market.volume)} Vol.</span>
          {traderCount != null && (
            <>
              <span>•</span>
              <span>{traderCount} {traderCount === 1 ? "trader" : "traders"}</span>
            </>
          )}
          <span>•</span>
          <span>{timeAgo(market.created_at)}</span>
          <span>•</span>
          <span>{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
          {market.status === "resolved" && (
            <>
              <span>•</span>
              <span className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-medium">
                {market.resolution}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
