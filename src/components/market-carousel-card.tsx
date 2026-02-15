"use client";

import Link from "next/link";
import { timeAgo, formatLeaves, formatProbability } from "@/lib/utils";
import { getFpmmProbabilities } from "@/lib/fpmm";
import type { Market } from "@/lib/types";
import ProbabilityChart from "@/components/probability-chart";

export interface ProbabilityPoint {
  probability?: number;
  probability_distribution?: Record<string, number>;
  created_at: string;
}

interface MarketCarouselCardProps {
  market: Market;
  history?: ProbabilityPoint[];
}

export default function MarketCarouselCard({ market, history }: MarketCarouselCardProps) {
  const isBinary = market.market_type === "binary";

  return (
    <Link href={`/markets/${market.id}`} className="block h-full w-full">
      <div className="bg-card border border-border rounded-lg p-6 hover:border-accent/30 hover:shadow-md transition-all h-full w-full flex flex-col">
        {/* Header with question */}
        <h3 className="text-foreground font-bold text-xl leading-snug mb-4">
          {market.question}
        </h3>

        {/* Probabilities */}
        {isBinary ? (
          <div className="flex gap-8 mb-4">
            <div>
              <div className="text-4xl font-bold text-yes">
                {Math.round(market.probability * 100)}%
              </div>
              <div className="text-sm text-muted">Yes</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-no">
                {Math.round((1 - market.probability) * 100)}%
              </div>
              <div className="text-sm text-muted">No</div>
            </div>
          </div>
        ) : (
          <div className="mb-4">
            {market.outcome_pools && (
              <div className="flex flex-wrap gap-4">
                {Object.entries(getFpmmProbabilities(market.outcome_pools))
                  .sort(([, a], [, b]) => b - a)
                  .map(([outcome, prob]) => (
                    <div key={outcome}>
                      <div className="text-2xl font-bold text-accent">
                        {formatProbability(prob)}
                      </div>
                      <div className="text-sm text-muted">{outcome}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Probability chart */}
        <div className="flex-1 min-h-0">
          {history && history.length > 0 ? (
            <ProbabilityChart data={history} resolvedAt={market.resolved_at} />
          ) : (
            <div className="bg-card border border-border rounded-lg p-4 h-full flex items-center justify-center">
              <div className="text-muted text-sm">No history data</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 mt-4 text-xs text-muted">
          <span className="font-medium">{formatLeaves(market.volume)} Vol.</span>
          <span>•</span>
          <span>{timeAgo(market.created_at)}</span>
          {market.status === "resolved" && (
            <span className="px-2 py-1 bg-accent/10 text-accent rounded">
              {market.resolution}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
