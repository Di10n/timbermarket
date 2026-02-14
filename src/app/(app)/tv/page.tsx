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
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

const RANKING_WINDOW = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL = 3_000; // poll every 3 seconds
const ROTATE_INTERVAL = 10_000; // rotate featured market every 10 seconds
const TOP_N = 10;

interface TradeWithContext extends Trade {
  profiles?: { username: string };
  markets?: { question: string };
}

interface RankedMarket extends Market {
  recentVolume: number;
  recentTradeCount: number;
}

interface ProbPoint {
  probability: number;
  created_at: string;
}

export default function TVPage() {
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [top10, setTop10] = useState<RankedMarket[]>([]);
  const [historyByMarket, setHistoryByMarket] = useState<
    Record<string, ProbPoint[]>
  >({});
  const [trades, setTrades] = useState<TradeWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
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
      const volumeMap: Record<string, number> = {};
      const tradeCountMap: Record<string, number> = {};
      if (windowRes.data) {
        for (const t of windowRes.data) {
          volumeMap[t.market_id] =
            (volumeMap[t.market_id] ?? 0) + Number(t.amount);
          tradeCountMap[t.market_id] = (tradeCountMap[t.market_id] ?? 0) + 1;
        }
      }

      const ranked: RankedMarket[] = (marketsRes.data as Market[]).map(
        (m) => ({
          ...m,
          recentVolume: volumeMap[m.id] ?? 0,
          recentTradeCount: tradeCountMap[m.id] ?? 0,
        })
      );
      ranked.sort((a, b) => {
        if (b.recentVolume !== a.recentVolume)
          return b.recentVolume - a.recentVolume;
        return b.volume - a.volume;
      });

      setMarkets(ranked);
      const top = ranked.slice(0, TOP_N);
      setTop10(top);

      // Fetch probability history for top 10 markets
      if (top.length > 0) {
        const ids = top.map((m) => m.id);
        const { data: historyRows } = await supabase
          .from("probability_history")
          .select("market_id, probability, created_at")
          .in("market_id", ids)
          .order("created_at", { ascending: true });

        const byMarket: Record<string, ProbPoint[]> = {};
        for (const row of historyRows ?? []) {
          const id = row.market_id as string;
          if (!byMarket[id]) byMarket[id] = [];
          byMarket[id].push({
            probability: Number(row.probability),
            created_at: row.created_at,
          });
        }
        setHistoryByMarket(byMarket);
      }
    }

    if (feedRes.data) {
      setTrades(feedRes.data as TradeWithContext[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAndRank();
    const interval = setInterval(fetchAndRank, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAndRank]);

  // Rotate through top 10
  useEffect(() => {
    if (top10.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % top10.length);
    }, ROTATE_INTERVAL);
    return () => clearInterval(interval);
  }, [top10.length]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("tv-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        () => fetchAndRank()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "markets" },
        () => fetchAndRank()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
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

  const featured = top10[currentIndex];

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col overflow-hidden">
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
          Top {TOP_N} by 10 min volume · Rotating every 10s
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: single rotating featured market card */}
        <div className="w-2/3 flex flex-col border-r border-border/50">
          <div className="flex-1 overflow-hidden p-6 min-h-0 flex flex-col">
            {top10.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted text-lg">No active markets</p>
              </div>
            ) : (
              <Link
                href={`/markets/${featured.id}`}
                className="flex flex-col h-full rounded-2xl bg-card border border-border overflow-hidden hover:border-border/80 hover:bg-card-hover transition-all"
              >
                {/* Question + timestamp + volume */}
                <div className="p-6 pb-2 shrink-0">
                  <h2 className="text-xl font-bold text-foreground leading-tight mb-2">
                    {featured.question}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-muted flex-wrap">
                    <span>Created {timeAgo(featured.created_at)}</span>
                    <span className="text-accent font-medium">
                      {featured.recentTradeCount} trades in last 10 min
                    </span>
                    <span>{formatLeaves(featured.volume)} total volume</span>
                  </div>
                </div>

                {/* Big Yes / No percentages */}
                <div className="px-6 py-4 flex gap-12 shrink-0">
                  <div>
                    <div className="text-4xl font-bold text-yes tabular-nums">
                      {Math.round(featured.probability * 100)}%
                    </div>
                    <div className="text-sm font-medium text-foreground mt-0.5">
                      Yes
                    </div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold text-no tabular-nums">
                      {Math.round((1 - featured.probability) * 100)}%
                    </div>
                    <div className="text-sm font-medium text-foreground mt-0.5">
                      No
                    </div>
                  </div>
                </div>

                {/* Probability trend chart */}
                <div className="flex-1 min-h-0 px-6 pb-6 flex flex-col">
                  <div className="bg-background/60 border border-border/50 rounded-xl p-4 flex-1 min-h-[200px]">
                    <h3 className="text-sm font-medium text-foreground mb-3">
                      Probability
                    </h3>
                    <FeaturedChart
                      marketId={featured.id}
                      data={historyByMarket[featured.id] ?? []}
                      currentProb={featured.probability}
                    />
                  </div>
                </div>

                {/* Rotation dots */}
                {top10.length > 1 && (
                  <div className="flex justify-center gap-1.5 pb-4 shrink-0">
                    {top10.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Go to market ${i + 1}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentIndex(i);
                        }}
                        className={`h-2 rounded-full transition-all ${
                          i === currentIndex
                            ? "w-6 bg-accent"
                            : "w-2 bg-border hover:bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </Link>
            )}
          </div>

          {/* Comments placeholder */}
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

        {/* Right panel: Recent trades */}
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

function FeaturedChart({
  marketId,
  data,
  currentProb,
}: {
  marketId: string;
  data: ProbPoint[];
  currentProb: number;
}) {
  const gradId = `tvProbGrad-${marketId}`;
  if (!data || data.length === 0) {
    const single = [
      {
        time: Date.now() - 3600000,
        probability: Math.round(currentProb * 100),
      },
      { time: Date.now(), probability: Math.round(currentProb * 100) },
    ];
    return (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={single}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-yes)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke="var(--color-yes)"
            fill={`url(#${gradId})`}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  const chartData = data.map((p) => ({
    time: new Date(p.created_at).getTime(),
    probability: Math.round(p.probability * 100),
  }));
  const endTime = Date.now();
  const last = chartData[chartData.length - 1];
  if (last && last.time < endTime) {
    chartData.push({ time: endTime, probability: last.probability });
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-yes)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          type="number"
          domain={["dataMin", endTime]}
          tickFormatter={(v) =>
            new Date(v).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })
          }
          stroke="var(--color-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke="var(--color-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Area
          type="monotone"
          dataKey="probability"
          stroke="var(--color-yes)"
          fill={`url(#${gradId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TVTradeRow({ trade }: { trade: TradeWithContext }) {
  const marketQuestion = trade.markets?.question ?? "Unknown market";

  return (
    <div className="px-5 py-3 hover:bg-card-hover/50 transition-colors">
      <div className="text-xs text-muted truncate mb-1.5">
        {marketQuestion}
      </div>
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
