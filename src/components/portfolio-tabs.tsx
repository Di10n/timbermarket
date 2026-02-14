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
      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          onClick={() => setTab("positions")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "positions"
              ? "text-foreground border-b-2 border-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Positions ({activePositions.length})
        </button>
        <button
          onClick={() => setTab("trades")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "trades"
              ? "text-foreground border-b-2 border-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          Trades ({trades.length})
        </button>
      </div>

      {/* Positions tab */}
      {tab === "positions" && (
        <div>
          {activePositions.length === 0 && (
            <p className="text-muted text-sm py-4">
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
              <Link key={pos.id} href={`/markets/${pos.market_id}`} className="block">
                <div className="border-b border-border py-4 px-2 hover:bg-card-hover/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-medium text-foreground mb-1">
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
                          <span className="px-1.5 py-0.5 bg-border/50 text-foreground">
                            Resolved {pos.markets.resolution}
                          </span>
                        )}
                      </div>
                    </div>
                    {pos.markets.status === "active" && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
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
        <div>
          {trades.length === 0 && (
            <p className="text-muted text-sm py-4">No trades yet.</p>
          )}
          {trades.map((trade) => (
            <Link key={trade.id} href={`/markets/${trade.market_id}`} className="block">
              <div className="flex items-center justify-between py-3 px-2 border-b border-border hover:bg-card-hover/30 transition-colors text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 ${
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
                  <span>{formatLeaves(trade.amount)} 🍃</span>
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
