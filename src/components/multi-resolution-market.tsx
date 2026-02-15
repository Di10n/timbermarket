"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProbabilityChart from "@/components/probability-chart";
import RecentTrades from "@/components/recent-trades";
import MarketComments from "@/components/market-comments";
import { getFpmmProbabilities, calculateBuyShares as calculateBuySharesFpmm } from "@/lib/fpmm";
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
  const router = useRouter();
  const [loadingOutcome, setLoadingOutcome] = useState<string | null>(null);

  const probs = market.outcome_pools ? getFpmmProbabilities(market.outcome_pools) : {};
  const outcomes = Object.keys(probs);

  // Sort outcomes by probability (highest first)
  const sortedOutcomes = outcomes
    .map((outcome) => ({
      outcome,
      probability: probs[outcome],
    }))
    .sort((a, b) => b.probability - a.probability);

  async function handleBuy(outcome: string, side: "YES" | "NO") {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    setLoadingOutcome(`${outcome}-${side}`);

    try {
      // For YES, buy shares directly
      // For NO, we'd need to implement buying shares of all other outcomes (complete set minus this one)
      // For simplicity, we'll just buy YES for now
      const amount = 10; // Default amount

      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          outcome,
          type: "BUY",
          amount,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        console.error(data.error || "Trade failed");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("Something went wrong", error);
    } finally {
      setLoadingOutcome(null);
    }
  }

  // Calculate price for buying 1 share (in cents)
  function getSharePrice(outcome: string): number {
    if (!market.outcome_pools) return 0;
    try {
      const result = calculateBuySharesFpmm(market.outcome_pools, 1, outcome);
      const costPer = 1 / result.shares;
      return Math.round(costPer * 100); // Convert to cents
    } catch {
      return Math.round(probs[outcome] * 100);
    }
  }

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

      {/* Probability Chart */}
      <div className="mb-6">
        <ProbabilityChart data={historyData} resolvedAt={market.resolved_at} />
      </div>

      {/* Outcome List */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 mb-6">
        <div className="space-y-4">
          {sortedOutcomes.map(({ outcome, probability }, idx) => {
            const yesPrice = getSharePrice(outcome);
            const noPrice = 100 - yesPrice;
            const userShares = position?.shares_by_outcome?.[outcome] || 0;

            return (
              <div
                key={outcome}
                className="flex flex-col md:flex-row md:items-center gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
              >
                {/* Left: Outcome name and volume */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: OUTCOME_COLORS[idx % OUTCOME_COLORS.length] }}
                    />
                    <h3 className="font-semibold text-base truncate">{outcome}</h3>
                  </div>
                  {userShares > 0 && (
                    <p className="text-xs text-muted mt-1">
                      You have {userShares.toFixed(2)} shares
                    </p>
                  )}
                </div>

                {/* Center: Probability */}
                <div className="flex items-center gap-2">
                  <div className="text-3xl md:text-4xl font-bold">
                    {formatProbability(probability)}
                  </div>
                </div>

                {/* Right: Buy buttons */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleBuy(outcome, "YES")}
                    disabled={market.status !== "active" || loadingOutcome === `${outcome}-YES`}
                    className="px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 bg-yes/10 hover:bg-yes/20 border border-yes/30 text-yes min-w-[100px]"
                  >
                    {loadingOutcome === `${outcome}-YES` ? (
                      "..."
                    ) : (
                      <>
                        Buy Yes {yesPrice}¢
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleBuy(outcome, "NO")}
                    disabled={market.status !== "active" || loadingOutcome === `${outcome}-NO`}
                    className="px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 bg-no/10 hover:bg-no/20 border border-no/30 text-no min-w-[100px]"
                  >
                    {loadingOutcome === `${outcome}-NO` ? (
                      "..."
                    ) : (
                      <>
                        Buy No {noPrice}¢
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
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
