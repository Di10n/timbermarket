"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Market, Trade } from "@/lib/types";
import {
  formatProbability,
  formatLeaves,
  formatShares,
  timeAgo,
} from "@/lib/utils";
import Link from "next/link";

const RANKING_WINDOW = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL = 3_000; // poll every 3 seconds

interface TradeWithContext extends Trade {
  profiles?: { username: string };
  markets?: { question: string };
}

interface RankedMarket extends Market {
  recentVolume: number;
}

export default function TVPage() {
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [trades, setTrades] = useState<TradeWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const fetchAndRank = useCallback(async () => {
    const supabase = supabaseRef.current;
    const since = new Date(Date.now() - RANKING_WINDOW).toISOString();

    const [marketsRes, windowRes, feedRes] = await Promise.all([
      supabase.from("markets").select("*").eq("status", "active"),
      supabase
        .from("trades")
        .select("market_id, amount, created_at")
        .gte("created_at", since),
      supabase
        .from("trades")
        .select("*, profiles(username), markets(question)")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (marketsRes.data) {
      // Sum trade volume per market in the window
      const volumeMap: Record<string, number> = {};
      if (windowRes.data) {
        for (const t of windowRes.data) {
          volumeMap[t.market_id] =
            (volumeMap[t.market_id] ?? 0) + Number(t.amount);
        }
      }

      const ranked: RankedMarket[] = (marketsRes.data as Market[]).map(
        (m) => ({ ...m, recentVolume: volumeMap[m.id] ?? 0 })
      );
      ranked.sort((a, b) => {
        if (b.recentVolume !== a.recentVolume)
          return b.recentVolume - a.recentVolume;
        return b.volume - a.volume;
      });

      setMarkets(ranked);
    }

    if (feedRes.data) {
      setTrades(feedRes.data as TradeWithContext[]);
    }

    setLoading(false);
  }, []);

  // Initial load + poll every 3 seconds
  useEffect(() => {
    fetchAndRank();
    const interval = setInterval(fetchAndRank, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAndRank]);

  // Also subscribe to realtime for instant updates (if realtime is enabled)
  useEffect(() => {
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("tv-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        () => {
          fetchAndRank();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        () => {
          fetchAndRank();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAndRank]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-[100]">
        <div className="text-muted text-lg animate-pulse">
          Loading markets...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/markets" className="text-accent font-bold text-xl">
            Timbermarket
          </Link>
          <span className="text-muted text-sm font-medium tracking-wide uppercase">
            Live
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yes opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yes" />
          </span>
        </div>
        <div className="text-muted text-xs">
          {markets.length} active market{markets.length !== 1 ? "s" : ""}
          {" · "}
          Ranked by 10 min volume
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel (2/3) */}
        <div className="w-2/3 flex flex-col border-r border-border/50">
          {/* Top: Markets */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {markets.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted text-lg">No active markets</p>
              </div>
            ) : (
              <div className="space-y-3">
                {markets.map((market, i) => (
                  <TVMarketCard key={market.id} market={market} rank={i + 1} />
                ))}
              </div>
            )}
          </div>

          {/* Bottom: Comments placeholder */}
          <div className="shrink-0 h-56 border-t border-border/50 flex flex-col">
            <div className="px-6 py-3 border-b border-border/50 shrink-0">
              <h2 className="text-sm font-semibold text-foreground">
                Comments
              </h2>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted text-sm">Comments coming soon</p>
            </div>
          </div>
        </div>

        {/* Right panel: Recent trades (1/3) */}
        <div className="w-1/3 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 shrink-0">
            <h2 className="text-sm font-semibold text-foreground">
              Recent Trades
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {trades.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted text-sm">No trades yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {trades.map((trade) => (
                  <TVTradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TVMarketCard({
  market,
  rank,
}: {
  market: RankedMarket;
  rank: number;
}) {
  const prob = market.probability;
  const yesPercent = Math.round(prob * 100);
  const noPercent = 100 - yesPercent;

  return (
    <Link href={`/markets/${market.id}`}>
      <div className="bg-card border border-border rounded-xl p-5 hover:border-border/80 hover:bg-card-hover transition-all group flex gap-5 items-center">
        {/* Rank */}
        <div className="text-2xl font-bold text-border shrink-0 w-8 text-center tabular-nums">
          {rank}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Question */}
          <h2 className="text-foreground font-semibold text-base leading-snug mb-3 truncate group-hover:text-accent transition-colors">
            {market.question}
          </h2>

          {/* Probability bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden bg-border/30 gap-px">
            <div
              className="bg-yes/80 rounded-l-full transition-all duration-700 ease-out"
              style={{ width: `${yesPercent}%` }}
            />
            <div
              className="bg-no/80 rounded-r-full transition-all duration-700 ease-out"
              style={{ width: `${noPercent}%` }}
            />
          </div>

          {/* Yes/No labels + meta */}
          <div className="flex justify-between mt-1.5 text-xs">
            <div className="flex gap-3 font-medium">
              <span className="text-yes">Yes {formatProbability(prob)}</span>
              <span className="text-no">
                No {formatProbability(1 - prob)}
              </span>
            </div>
            <div className="text-muted flex gap-3">
              {market.recentVolume > 0 && (
                <span className="text-accent">
                  {formatLeaves(market.recentVolume)} recent
                </span>
              )}
              <span>{formatLeaves(market.volume)} total</span>
            </div>
          </div>
        </div>

        {/* Large probability */}
        <div className="shrink-0 text-right">
          <div className="flex items-baseline gap-1">
            <span
              className={`text-3xl font-bold tabular-nums ${
                prob >= 0.5 ? "text-yes" : "text-no"
              }`}
            >
              {yesPercent}
            </span>
            <span className="text-muted text-sm">%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TVTradeRow({ trade }: { trade: TradeWithContext }) {
  const marketQuestion = trade.markets?.question ?? "Unknown market";

  return (
    <div className="px-5 py-3 hover:bg-card-hover/50 transition-colors">
      {/* Market name */}
      <div className="text-xs text-muted truncate mb-1.5">
        {marketQuestion}
      </div>

      {/* Trade info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-foreground font-medium">
            {trade.profiles?.username ?? "User"}
          </span>
          <span className="text-muted">
            {trade.type === "BUY" ? "bought" : "sold"}
          </span>
          <span
            className={`font-semibold ${
              trade.outcome === "YES" ? "text-yes" : "text-no"
            }`}
          >
            {trade.outcome}
          </span>
        </div>
        <span className="text-xs text-muted shrink-0">
          {timeAgo(trade.created_at)}
        </span>
      </div>

      {/* Details row */}
      <div className="flex items-center gap-3 mt-1 text-xs text-muted">
        <span>{formatLeaves(trade.amount)} leaves</span>
        <span>{formatShares(trade.shares)} shares</span>
        <span>
          {formatProbability(trade.prob_before)} →{" "}
          {formatProbability(trade.prob_after)}
        </span>
      </div>
    </div>
  );
}
