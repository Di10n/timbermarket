"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calculateBuyShares,
  getProbabilityAfterBuy,
  calculateSellPayout,
  getProbabilityAfterSell,
} from "@/lib/amm";
import {
  calculateBuyShares as calculateBuySharesFpmm,
  calculateSellPayout as calculateSellPayoutFpmm,
  getFpmmProbabilities,
} from "@/lib/fpmm";
import { formatProbability, formatShares, formatLeaves } from "@/lib/utils";
import type { Market, Position } from "@/lib/types";
import LeafIcon from "@/components/leaf-icon";

interface TradePanelProps {
  market: Market;
  position: Position | null;
  balance: number;
  isLoggedIn?: boolean;
}

export default function TradePanel({
  market,
  position,
  balance,
  isLoggedIn = true,
}: TradePanelProps) {
  const searchParams = useSearchParams();
  const outcomeParam = searchParams.get("outcome");

  // Determine initial outcome based on market type
  const isBinary = market.market_type === "binary";
  const availableOutcomes = isBinary
    ? ["YES", "NO"]
    : (market.outcomes || []);
  const initialOutcome = availableOutcomes.includes(outcomeParam || "")
    ? outcomeParam!
    : availableOutcomes[0];

  const [mode, setMode] = useState<"BUY" | "SELL">("BUY");
  const [outcome, setOutcome] = useState<string>(initialOutcome);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Update outcome when URL parameter changes
  useEffect(() => {
    if (availableOutcomes.includes(outcomeParam || "")) {
      setOutcome(outcomeParam!);
    }
  }, [outcomeParam, availableOutcomes]);

  const numAmount = parseFloat(amount) || 0;
  const isActive = market.status === "active";

  // Get current probabilities for multi markets
  const currentProbs = isBinary
    ? { YES: market.probability, NO: 1 - market.probability }
    : market.outcome_pools
      ? getFpmmProbabilities(market.outcome_pools)
      : {};

  // Calculate preview
  let previewShares = 0;
  let previewProb = isBinary ? market.probability : (currentProbs[outcome] || 0);
  let previewPayout = 0;
  let previewRedeemed = 0;

  if (numAmount > 0 && isActive) {
    if (mode === "BUY") {
      if (isBinary) {
        previewShares = calculateBuyShares(
          market.pool_yes,
          market.pool_no,
          market.p,
          numAmount,
          outcome
        );
        previewProb = getProbabilityAfterBuy(
          market.pool_yes,
          market.pool_no,
          market.p,
          numAmount,
          outcome
        );
        // Account for auto-redemption of offsetting positions
        const existingOpposite = outcome === "YES"
          ? (position?.no_shares ?? 0)
          : (position?.yes_shares ?? 0);
        previewRedeemed = Math.min(previewShares, existingOpposite);
        previewPayout = previewShares - previewRedeemed;
      } else {
        // Multi-resolution market
        if (market.outcome_pools) {
          const result = calculateBuySharesFpmm(
            market.outcome_pools,
            numAmount,
            outcome
          );
          previewShares = result.shares;
          const newProbs = getFpmmProbabilities(result.newPools);
          previewProb = newProbs[outcome];
          previewPayout = previewShares; // No auto-redemption for multi markets
        }
      }
    } else {
      if (isBinary) {
        const maxShares =
          outcome === "YES"
            ? position?.yes_shares ?? 0
            : position?.no_shares ?? 0;
        const sharesToSell = Math.min(numAmount, maxShares);
        if (sharesToSell > 0) {
          previewPayout = calculateSellPayout(
            market.pool_yes,
            market.pool_no,
            market.p,
            sharesToSell,
            outcome
          );
          previewProb = getProbabilityAfterSell(
            market.pool_yes,
            market.pool_no,
            market.p,
            sharesToSell,
            outcome
          );
          previewShares = sharesToSell;
        }
      } else {
        // Multi-resolution market
        const maxShares = position?.shares_by_outcome?.[outcome] ?? 0;
        const sharesToSell = Math.min(numAmount, maxShares);
        if (sharesToSell > 0 && market.outcome_pools) {
          previewPayout = calculateSellPayoutFpmm(
            market.outcome_pools,
            sharesToSell,
            outcome
          );
          // Calculate new probability after sell (inverse of buy)
          previewShares = sharesToSell;
          previewProb = currentProbs[outcome]; // Simplified, actual calc is complex
        }
      }
    }
  }

  async function handleTrade() {
    // Redirect to login if not logged in
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    if (!numAmount || numAmount <= 0) return;
    setError("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        marketId: market.id,
        outcome,
        type: mode,
      };

      if (mode === "BUY") {
        body.amount = numAmount;
      } else {
        // Clamp to available shares to avoid floating-point mismatch with DB
        const available = isBinary
          ? (outcome === "YES"
              ? position?.yes_shares ?? 0
              : position?.no_shares ?? 0)
          : (position?.shares_by_outcome?.[outcome] ?? 0);
        const sharesToSell =
          Math.abs(numAmount - available) < 0.01 ? available : Math.min(numAmount, available);
        body.shares = sharesToSell;
      }

      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // Redirect to login if unauthorized
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        setError(data.error || "Trade failed");
        setLoading(false);
        return;
      }

      setAmount("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasPosition = isBinary
    ? position && (position.yes_shares > 0 || position.no_shares > 0)
    : position && position.shares_by_outcome && Object.values(position.shares_by_outcome).some(s => s > 0);

  return (
    <div className="bg-card border border-border rounded-lg p-4 h-full">
      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 bg-background rounded-lg p-1">
        <button
          onClick={() => {
            setMode("BUY");
            setAmount("");
          }}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "BUY"
              ? "bg-card text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => {
            setMode("SELL");
            setAmount("");
          }}
          disabled={!hasPosition}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-30 ${
            mode === "SELL"
              ? "bg-card text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Outcome toggle */}
      <div className={`gap-2 mb-4 ${isBinary ? "flex" : "grid grid-cols-2"}`}>
        {isBinary ? (
          <>
            <button
              onClick={() => setOutcome("YES")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                outcome === "YES"
                  ? "border-yes bg-yes/10 text-yes"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              Yes {formatProbability(market.probability)}
            </button>
            <button
              onClick={() => setOutcome("NO")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                outcome === "NO"
                  ? "border-no bg-no/10 text-no"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              No {formatProbability(1 - market.probability)}
            </button>
          </>
        ) : (
          availableOutcomes.map((opt, idx) => (
            <button
              key={opt}
              onClick={() => setOutcome(opt)}
              className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                outcome === opt
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {opt} {formatProbability(currentProbs[opt] || 0)}
            </button>
          ))
        )}
      </div>

      {/* Amount input */}
      <div className="mb-4">
        <label className="block text-xs text-muted mb-1">
          {mode === "BUY" ? <>Amount (<LeafIcon />)</> : "Shares to sell"}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          min="0"
          step="any"
          disabled={!isActive}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-lg focus:outline-none focus:border-accent disabled:opacity-50"
        />
        {mode === "BUY" && (
          <p className="text-xs text-muted mt-1">
            Balance: {formatLeaves(balance)} <LeafIcon />
          </p>
        )}
        {mode === "SELL" && position && (
          <p className="text-xs text-muted mt-1">
            Available: {formatShares(
              isBinary
                ? (outcome === "YES" ? position.yes_shares : position.no_shares)
                : (position.shares_by_outcome?.[outcome] ?? 0)
            )} shares
          </p>
        )}
      </div>

      {/* Preview */}
      {numAmount > 0 && isActive && (
        <div className="mb-4 space-y-1.5 text-sm">
          {mode === "BUY" ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted">Shares</span>
                <span>{formatShares(isBinary ? previewShares - previewRedeemed : previewShares)}</span>
              </div>
              {isBinary && previewRedeemed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Auto-redeemed</span>
                  <span className="text-yes">
                    +{formatLeaves(previewRedeemed)} <LeafIcon />
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Value if wins</span>
                <span className="text-yes">
                  {formatLeaves(previewPayout)} <LeafIcon />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">New probability</span>
                <span>{formatProbability(previewProb)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-muted">Payout</span>
                <span className="text-yes">
                  {formatLeaves(previewPayout)} <LeafIcon />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">New probability</span>
                <span>{formatProbability(previewProb)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-no text-sm mb-3">{error}</p>}

      <button
        onClick={handleTrade}
        disabled={
          loading ||
          !isActive ||
          numAmount <= 0 ||
          (mode === "BUY" && numAmount > balance)
        }
        className={`w-full py-2.5 font-medium rounded-lg transition-colors disabled:opacity-50 ${
          isBinary && outcome === "YES"
            ? "bg-yes hover:bg-yes/90 text-background"
            : isBinary && outcome === "NO"
              ? "bg-no hover:bg-no/90 text-white"
              : "bg-accent hover:bg-accent-hover text-background"
        }`}
      >
        {loading
          ? "Processing..."
          : !isActive
            ? "Market closed"
            : mode === "BUY"
              ? `Buy ${outcome}`
              : `Sell ${outcome}`}
      </button>

      {/* Current position */}
      {hasPosition && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted mb-2">Your position</p>
          {isBinary ? (
            <div className="flex gap-4 text-sm">
              {position!.yes_shares > 0 && (
                <div>
                  <span className="text-yes">
                    {formatShares(position!.yes_shares)} YES
                  </span>
                </div>
              )}
              {position!.no_shares > 0 && (
                <div>
                  <span className="text-no">
                    {formatShares(position!.no_shares)} NO
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(position!.shares_by_outcome || {})
                .filter(([_, shares]) => shares > 0)
                .map(([outcome, shares]) => (
                  <div key={outcome}>
                    <span className="text-accent">
                      {formatShares(shares)} {outcome}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
