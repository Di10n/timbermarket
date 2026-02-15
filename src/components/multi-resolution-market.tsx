"use client";

import ProbabilityChart from "@/components/probability-chart";
import TradePanel from "@/components/trade-panel";
import RecentTrades from "@/components/recent-trades";
import MarketComments from "@/components/market-comments";
import { getFpmmProbabilities } from "@/lib/fpmm";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market, Position, Trade, CommentWithProfile } from "@/lib/types";
import LeafIcon from "@/components/leaf-icon";

const OUTCOME_COLORS = [
  "rgb(59, 130, 246)", // blue
  "rgb(34, 197, 94)", // green
  "rgb(168, 85, 247)", // purple
  "rgb(251, 146, 60)", // orange
  "rgb(239, 68, 68)", // red
  "rgb(236, 72, 153)", // pink
  "rgb(6, 182, 212)", // cyan
  "rgb(250, 204, 21)", // yellow
  "rgb(99, 102, 241)", // indigo
  "rgb(20, 184, 166)", // teal
];

interface MultiResolutionMarketProps {
  market: Market;
  position: Position | null;
  balance: number;
  isLoggedIn: boolean;
  historyData: Array<{ probability_distribution?: Record<string, number>; created_at: string }>;
  comments: CommentWithProfile[];
  trades: (Trade & { profiles?: { username: string } })[];
  traderCount: number;
  isAdmin: boolean;
  currentUserId?: string;
}

export default function MultiResolutionMarket({
  market,
  position,
  balance,
  isLoggedIn,
  historyData,
  comments,
  trades,
  traderCount,
  isAdmin,
  currentUserId,
}: MultiResolutionMarketProps) {
  const probs = market.outcome_pools ? getFpmmProbabilities(market.outcome_pools) : {};

  // Sort outcomes by probability (highest first)
  const sortedOutcomes = Object.entries(probs)
    .map(([outcome, probability]) => ({ outcome, probability }))
    .sort((a, b) => b.probability - a.probability);

  return (
    <div>
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 mb-6">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold mb-2">{market.question}</h1>
            {market.description && (
              <p className="text-muted text-sm">{market.description}</p>
            )}
          </div>

          {/* Show all outcomes with probabilities */}
          <div className="flex flex-wrap items-center gap-4 mb-2">
            {sortedOutcomes.map(({ outcome, probability }, idx) => (
              <div key={outcome} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: OUTCOME_COLORS[idx % OUTCOME_COLORS.length] }}
                />
                <span className="font-medium text-foreground">{outcome}</span>
                <span className="text-accent font-bold">{formatProbability(probability)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className="font-medium whitespace-nowrap flex items-center gap-1">
              <LeafIcon /> {formatLeaves(market.volume)} Vol.
            </span>
            <span>•</span>
            <span className="whitespace-nowrap">{timeAgo(market.created_at)}</span>
            <span>•</span>
            <span className="whitespace-nowrap">{traderCount} {traderCount === 1 ? "trader" : "traders"}</span>
            {market.status === "resolved" && (
              <>
                <span>•</span>
                <span className="px-2 py-0.5 bg-border/50 rounded text-foreground text-xs font-medium whitespace-nowrap">
                  Resolved: {market.resolution}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chart and Trade Panel side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <ProbabilityChart data={historyData} resolvedAt={market.resolved_at} />
        </div>
        <div className="lg:col-span-1">
          <TradePanel
            market={market}
            position={position}
            balance={balance}
            isLoggedIn={isLoggedIn}
          />
        </div>
      </div>

      {/* Bottom: Comments (left) + Recent Trades (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketComments
          marketId={market.id}
          comments={comments}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
        <RecentTrades trades={trades} />
      </div>
    </div>
  );
}
