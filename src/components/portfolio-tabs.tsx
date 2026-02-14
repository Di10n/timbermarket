"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatProbability,
  formatShares,
  formatLeaves,
  timeAgo,
} from "@/lib/utils";
import type { PositionWithMarket, TradeWithMarket } from "@/lib/types";

interface PortfolioTabsProps {
  positions: PositionWithMarket[];
  trades: TradeWithMarket[];
}

export default function PortfolioTabs({
  positions,
  trades,
}: PortfolioTabsProps) {
  const [tab, setTab] = useState<"positions" | "trades">("positions");

  const activePositions = positions.filter(
    (p) => p.yes_shares > 0 || p.no_shares > 0
  );

  return (
    <div>
      {/* Tab toggle */}
      <div className="flex gap-1 mb-4 bg-card rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("positions")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "positions"
              ? "bg-background text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Positions ({activePositions.length})
        </button>
        <button
          onClick={() => setTab("trades")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "trades"
              ? "bg-background text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          Trades ({trades.length})
        </button>
      </div>

      {/* Positions tab */}
      {tab === "positions" && (
        <div className="space-y-2">
          {activePositions.length === 0 && (
            <p className="text-muted text-sm">
              No positions yet. Start trading on a market!
            </p>
          )}
          {activePositions.map((pos) => {
            const currentValue =
              pos.markets.status === "active"
                ? pos.yes_shares * pos.markets.probability +
                  pos.no_shares * (1 - pos.markets.probability)
                : 0;
            const pnl = currentValue - pos.total_invested;

            return (
              <Link key={pos.id} href={`/markets/${pos.market_id}`}>
                <div className="bg-card border border-border rounded-lg p-4 hover:bg-card-hover transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium mb-1">
                        {pos.markets.question}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {pos.yes_shares > 0 && (
                          <span className="text-yes">
                            {formatShares(pos.yes_shares)} YES
                          </span>
                        )}
                        {pos.no_shares > 0 && (
                          <span className="text-no">
                            {formatShares(pos.no_shares)} NO
                          </span>
                        )}
                        <span>
                          Invested: {formatLeaves(pos.total_invested)}
                        </span>
                        {pos.markets.status === "resolved" && (
                          <span className="px-1.5 py-0.5 bg-border/50 rounded">
                            Resolved {pos.markets.resolution}
                          </span>
                        )}
                      </div>
                    </div>
                    {pos.markets.status === "active" && (
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {formatLeaves(currentValue)}
                        </p>
                        <p
                          className={`text-xs ${
                            pnl >= 0 ? "text-yes" : "text-no"
                          }`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {formatLeaves(pnl)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Trades tab */}
      {tab === "trades" && (
        <div className="space-y-1">
          {trades.length === 0 && (
            <p className="text-muted text-sm">No trades yet.</p>
          )}
          {trades.map((trade) => (
            <Link key={trade.id} href={`/markets/${trade.market_id}`}>
              <div className="flex items-center justify-between py-3 px-4 bg-card border border-border rounded-lg hover:bg-card-hover transition-colors text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      trade.type === "BUY"
                        ? "bg-yes/10 text-yes"
                        : "bg-no/10 text-no"
                    }`}
                  >
                    {trade.type}
                  </span>
                  <span
                    className={
                      trade.outcome === "YES" ? "text-yes" : "text-no"
                    }
                  >
                    {trade.outcome}
                  </span>
                  <span className="text-muted truncate max-w-xs">
                    {trade.markets.question}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted shrink-0">
                  <span>{formatLeaves(trade.amount)} leaves</span>
                  <span>{formatShares(trade.shares)} shares</span>
                  <span>
                    {formatProbability(trade.prob_before)} →{" "}
                    {formatProbability(trade.prob_after)}
                  </span>
                  <span>{timeAgo(trade.created_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
