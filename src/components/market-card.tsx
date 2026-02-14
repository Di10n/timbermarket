import Link from "next/link";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market } from "@/lib/types";

export default function MarketCard({ market }: { market: Market }) {
  const prob = market.probability;
  const probPercent = Math.round(prob * 100);

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
          <div className="flex-1 bg-yes/10 hover:bg-yes/20 border border-yes/30 rounded-xl py-4 text-center transition-colors">
            <span className="text-yes font-semibold text-lg">Yes</span>
          </div>
          <div className="flex-1 bg-no/10 hover:bg-no/20 border border-no/30 rounded-xl py-4 text-center transition-colors">
            <span className="text-no font-semibold text-lg">No</span>
          </div>
        </div>

        {/* Footer with volume and icons */}
        <div className="flex items-center justify-between text-sm text-muted">
          <div className="flex items-center gap-3">
            <span className="font-medium">{formatLeaves(market.volume)} Vol.</span>
            <span>•</span>
            <span>{timeAgo(market.created_at)}</span>
          </div>

          <div className="flex items-center gap-3">
            {market.status === "resolved" && (
              <span className="px-2 py-1 bg-accent/10 text-accent rounded text-xs font-medium">
                {market.resolution}
              </span>
            )}
            {/* Bookmark icon placeholder */}
            <svg className="w-5 h-5 text-muted hover:text-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}
