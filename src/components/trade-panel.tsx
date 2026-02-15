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
  calculateBuySharesFpmm,
  calculateSellPayoutFpmm,
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

const OUTCOME_COLORS = [
  'blue', 'green', 'purple', 'orange', 'red',
  'pink', 'cyan', 'yellow', 'indigo', 'teal'
];

function getOutcomeColor(index: number): string {
  return OUTCOME_COLORS[index % OUTCOME_COLORS.length];
}

export default function TradePanel({
  market,
  position,
  balance,
  isLoggedIn = true,
}: TradePanelProps) {
  const searchParams = useSearchParams();
  const outcomeParam = searchParams.get("outcome");

  const isMultiOutcome = market.market_type === 'multi';
  const outcomes = isMultiOutcome ? (market.outcomes || []) : ['YES', 'NO'];

  // Determine initial outcome
  let initialOutcome = outcomes[0];
  if (outcomeParam && outcomes.includes(outcomeParam)) {
    initialOutcome = outcomeParam;
  }

  const [mode, setMode] = useState<"BUY" | "SELL">("BUY");
  const [outcome, setOutcome] = useState<string>(initialOutcome);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Update outcome when URL parameter changes
  useEffect(() => {
    if (outcomeParam && outcomes.includes(outcomeParam)) {
      setOutcome(outcomeParam);
    }
  }, [outcomeParam, outcomes]);

  const numAmount = parseFloat(amount) || 0;
  const isActive = market.status === "active";

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

  // Calculate preview
  let previewShares = 0;
  let previewProb = probabilities[outcome] || 0;
  let previewPayout = 0;
  let previewRedeemed = 0;

  if (numAmount > 0 && isActive) {
    if (mode === "BUY") {
      if (isMultiOutcome && market.outcome_pools) {
        // Multi-outcome buy
        try {
          const result = calculateBuySharesFpmm(market.outcome_pools, numAmount, outcome);
          previewShares = result.shares;
          const newProbs = getFpmmProbabilities(result.newPools);
          previewProb = newProbs[outcome] || 0;
          previewPayout = previewShares; // No auto-redemption for multi-outcome
        } catch (e) {
          // Calculation error, keep defaults
        }
      } else {
        // Binary buy
        previewShares = calculateBuyShares(
          market.pool_yes,
          market.pool_no,
          market.p,
          numAmount,
          outcome as 'YES' | 'NO'
        );
        previewProb = getProbabilityAfterBuy(
          market.pool_yes,
          market.pool_no,
          market.p,
          numAmount,
          outcome as 'YES' | 'NO'
        );
        // Account for auto-redemption of offsetting positions (binary only)
        const existingOpposite = outcome === "YES"
          ? (position?.no_shares ?? 0)
          : (position?.yes_shares ?? 0);
        previewRedeemed = Math.min(previewShares, existingOpposite);
        previewPayout = previewShares - previewRedeemed;
      }
    } else {
      // SELL mode
      let maxShares = 0;

      if (isMultiOutcome && position?.shares_by_outcome) {
        maxShares = position.shares_by_outcome[outcome] ?? 0;
      } else if (!isMultiOutcome && position) {
        maxShares = outcome === "YES" ? position.yes_shares : position.no_shares;
      }

      const sharesToSell = Math.min(numAmount, maxShares);

      if (sharesToSell > 0) {
        if (isMultiOutcome && market.outcome_pools) {
          // Multi-outcome sell
          try {
            const result = calculateSellPayoutFpmm(market.outcome_pools, sharesToSell, outcome);
            previewPayout = result.payout;
            const newProbs = getFpmmProbabilities(result.newPools);
            previewProb = newProbs[outcome] || 0;
            previewShares = sharesToSell;
          } catch (e) {
            // Calculation error, keep defaults
          }
        } else {
          // Binary sell
          previewPayout = calculateSellPayout(
            market.pool_yes,
            market.pool_no,
            market.p,
            sharesToSell,
            outcome as 'YES' | 'NO'
          );
          previewProb = getProbabilityAfterSell(
            market.pool_yes,
            market.pool_no,
            market.p,
            sharesToSell,
            outcome as 'YES' | 'NO'
          );
          previewShares = sharesToSell;
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
        let available = 0;

        if (isMultiOutcome && position?.shares_by_outcome) {
          available = position.shares_by_outcome[outcome] ?? 0;
        } else if (!isMultiOutcome && position) {
          available = outcome === "YES" ? position.yes_shares : position.no_shares;
        }

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

  // Check if user has any position
  let hasPosition = false;
  if (isMultiOutcome && position?.shares_by_outcome) {
    hasPosition = Object.values(position.shares_by_outcome).some(shares => shares > 0);
  } else if (!isMultiOutcome && position) {
    hasPosition = position.yes_shares > 0 || position.no_shares > 0;
  }

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

      {/* Outcome buttons */}
      {isMultiOutcome ? (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {outcomes.map((o, index) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                outcome === o
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              <div className="truncate">{o}</div>
              <div className="text-xs">{formatProbability(probabilities[o] || 0)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setOutcome("YES")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
              outcome === "YES"
                ? "border-yes bg-yes/10 text-yes"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            Yes {formatProbability(probabilities['YES'])}
          </button>
          <button
            onClick={() => setOutcome("NO")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
              outcome === "NO"
                ? "border-no bg-no/10 text-no"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            No {formatProbability(probabilities['NO'])}
          </button>
        </div>
      )}

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
              isMultiOutcome && position.shares_by_outcome
                ? position.shares_by_outcome[outcome] ?? 0
                : outcome === "YES" ? position.yes_shares : position.no_shares
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
                <span>{formatShares(isMultiOutcome ? previewShares : previewShares - previewRedeemed)}</span>
              </div>
              {!isMultiOutcome && previewRedeemed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Auto-redeemed</span>
                  <span className="text-yes">
                    +{formatLeaves(previewRedeemed)} <LeafIcon />
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">Potential payout</span>
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
          !isMultiOutcome && outcome === "YES"
            ? "bg-yes hover:bg-yes/90 text-background"
            : !isMultiOutcome && outcome === "NO"
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
          <div className="flex flex-wrap gap-3 text-sm">
            {isMultiOutcome && position?.shares_by_outcome ? (
              Object.entries(position.shares_by_outcome)
                .filter(([_, shares]) => shares > 0)
                .map(([o, shares]) => (
                  <div key={o}>
                    <span className="text-accent">
                      {formatShares(shares)} {o}
                    </span>
                  </div>
                ))
            ) : (
              <>
                {position && position.yes_shares > 0 && (
                  <div>
                    <span className="text-yes">
                      {formatShares(position.yes_shares)} YES
                    </span>
                  </div>
                )}
                {position && position.no_shares > 0 && (
                  <div>
                    <span className="text-no">
                      {formatShares(position.no_shares)} NO
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
