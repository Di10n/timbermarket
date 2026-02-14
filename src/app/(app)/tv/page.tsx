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
import Image from "next/image";
import LeafIcon from "@/components/leaf-icon";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

const RANKING_WINDOW = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL = 3_000; // poll every 3 seconds
const TOP_N = 10;
const LIST_COUNT = 5;

interface TradeWithContext extends Trade {
  profiles?: { username: string };
  markets?: { question: string };
}

interface RankedMarket extends Market {
  recentVolume: number;
}

interface ProbPoint {
  probability: number;
  created_at: string;
}

export default function TVPage() {
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [top10, setTop10] = useState<RankedMarket[]>([]);
  const [featuredMarket, setFeaturedMarket] = useState<RankedMarket | null>(
    null
  );
  const [historyByMarket, setHistoryByMarket] = useState<
    Record<string, ProbPoint[]>
  >({});
  const [trades, setTrades] = useState<TradeWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallingLeaves, setFallingLeaves] = useState<
    { key: string; count: number }[]
  >([]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const supabaseRef = useRef(createClient());
  const previousFirstTradeIdRef = useRef<string | null>(null);

  const fetchAndRank = useCallback(async () => {
    const supabase = supabaseRef.current;
    const since = new Date(Date.now() - RANKING_WINDOW).toISOString();

    const [marketsRes, featuredRes, windowRes, feedRes, countRes] =
      await Promise.all([
        supabase.from("markets").select("*").eq("status", "active"),
        supabase
          .from("markets")
          .select("*")
          .eq("status", "active")
          .eq("is_featured", true)
          .maybeSingle(),
        supabase
          .from("trades")
          .select("market_id, amount, created_at")
          .gte("created_at", since),
        supabase
          .from("trades")
          .select("*, profiles(username), markets(question)")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true }),
      ]);

    if (marketsRes.data) {
      const volumeMap: Record<string, number> = {};
      if (windowRes.data) {
        for (const t of windowRes.data) {
          volumeMap[t.market_id] =
            (volumeMap[t.market_id] ?? 0) + Number(t.amount);
        }
      }

      const ranked: RankedMarket[] = (marketsRes.data as Market[]).map(
        (m) => ({
          ...m,
          recentVolume: volumeMap[m.id] ?? 0,
        })
      );
      // Rank by trading volume (leaves) in last 10 min
      ranked.sort((a, b) => {
        if (b.recentVolume !== a.recentVolume)
          return b.recentVolume - a.recentVolume;
        return b.volume - a.volume;
      });

      setMarkets(ranked);
      const top = ranked.slice(0, TOP_N);
      setTop10(top);

      // Featured: admin-selected market (is_featured = true)
      const featuredRow = featuredRes.data as Market | null;
      const featured =
        featuredRow
          ? {
              ...featuredRow,
              recentVolume: volumeMap[featuredRow.id] ?? 0,
            }
          : null;
      setFeaturedMarket(featured);

      // Fetch probability history for top 10 + featured
      const ids = [...top.map((m) => m.id)];
      if (featured && !ids.includes(featured.id)) ids.push(featured.id);
      if (ids.length > 0) {
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

    if (countRes.count != null) {
      setUserCount(countRes.count);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAndRank();
    const interval = setInterval(fetchAndRank, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAndRank]);

  // When a new trade appears at the top, spawn falling leaves (count = trade volume / 10)
  useEffect(() => {
    if (trades.length === 0) return;
    const firstId = trades[0].id;
    const prevId = previousFirstTradeIdRef.current;
    if (prevId !== null && firstId !== prevId) {
      const amount = Number(trades[0].amount);
      const count = Math.max(1, Math.floor(amount / 10));
      const key = firstId;
      setFallingLeaves((prev) => [...prev, { key, count }]);
      const t = setTimeout(() => {
        setFallingLeaves((p) => p.filter((b) => b.key !== key));
      }, 4000);
      previousFirstTradeIdRef.current = firstId;
      return () => clearTimeout(t);
    }
    previousFirstTradeIdRef.current = firstId;
  }, [trades]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("tv-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades" },
        (payload) => {
          // Spawn leaves from INSERT payload (Supabase JS uses .new; some docs use .newRecord).
          const raw =
            (payload as { new?: unknown; newRecord?: unknown }).new ??
            (payload as { newRecord?: unknown }).newRecord;
          const row = raw as Record<string, unknown> | null;
          const id = row?.id != null ? String(row.id) : null;
          const amount = Number(row?.amount ?? 0);
          if (id) {
            const count = Math.max(1, Math.floor(amount / 10));
            setFallingLeaves((prev) => [...prev, { key: id, count }]);
            previousFirstTradeIdRef.current = id;
            setTimeout(() => {
              setFallingLeaves((p) => p.filter((b) => b.key !== id));
            }, 4000);
          }
          fetchAndRank();
        }
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

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col overflow-hidden p-3">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/timbermarket_logo.svg"
            alt="TimberMarket"
            width={44}
            height={44}
            className="shrink-0 w-11 h-11"
          />
          <span className="text-accent font-bold text-2xl font-[family-name:var(--font-gaegu)]">
            TimberMarket
          </span>
        </Link>
        {userCount != null && (
          <span className="text-foreground text-2xl font-bold font-[family-name:var(--font-gaegu)] tabular-nums">
            {userCount.toLocaleString()} user{userCount !== 1 ? "s" : ""} 👋
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: top = featured, bottom = top 5 by trading volume; no scroll */}
        <div className="w-2/3 flex flex-col border-r border-border/50 min-h-0 overflow-hidden">
          {/* Top: featured market (admin-selected) */}
          <div className="flex-[0_0_40%] flex flex-col min-h-0 overflow-hidden">
            {featuredMarket ? (
              <Link
                href={`/markets/${featuredMarket.id}`}
                className="flex-1 flex flex-col min-h-0 min-w-0 px-2 py-4 bg-card/30 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
                  <h2 className="text-3xl font-bold text-foreground leading-tight line-clamp-2 flex-1 min-w-0">
                    {featuredMarket.question}
                  </h2>
                  <div
                    className={`text-3xl font-bold tabular-nums shrink-0 ${
                      featuredMarket.probability >= 0.5 ? "text-yes" : "text-no"
                    }`}
                  >
                    {Math.round(featuredMarket.probability * 100)}%
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted mb-3 shrink-0">
                  <span>Created {timeAgo(featuredMarket.created_at)}</span>
                  <span className="text-accent font-medium">
                    {formatLeaves(featuredMarket.recentVolume)} vol in last 10 min
                  </span>
                  <span>{formatLeaves(featuredMarket.volume)} total volume</span>
                </div>
                <div className="w-full max-h-[213px] rounded-lg overflow-hidden border border-border/50 shrink-0 p-2">
                  <FeaturedChart
                    marketId={featuredMarket.id}
                    data={historyByMarket[featuredMarket.id] ?? []}
                    currentProb={featuredMarket.probability}
                    height={197}
                  />
                </div>
              </Link>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 bg-card/30">
                <p className="text-muted text-sm">
                  No featured market (set one in Admin)
                </p>
              </div>
            )}
          </div>
          {/* Bottom: top 5 list (takes remaining space, meets top) */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 gap-2">
              {top10.length === 0 ? (
                <div className="flex items-center justify-center flex-1 min-h-0">
                  <p className="text-muted text-sm">No active markets</p>
                </div>
              ) : (
                top10.slice(0, LIST_COUNT).map((market, i) => (
                  <TVMarketBlock
                    key={market.id}
                    market={market}
                    rank={i + 1}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right panel: Recent trades */}
        <div className="w-1/3 flex flex-col overflow-hidden relative">
          <div className="px-5 py-4 border-b border-border/50 shrink-0">
            <h2 className="text-lg font-semibold text-foreground">
              Recent Trades
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto relative">
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
          {/* Falling leaves overlay when new trades arrive */}
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden z-10"
            aria-hidden
          >
            {fallingLeaves.map((burst) => {
              const count = burst.count;
              const bandWidth = 90 / Math.max(1, count);
              return Array.from({ length: count }, (_, i) => {
                const seed = `${burst.key}-${i}`;
                const hash = (s: string) => {
                  let h = 0;
                  for (let j = 0; j < s.length; j++)
                    h = ((h << 5) - h + s.charCodeAt(j)) | 0;
                  return Math.abs(h);
                };
                const h1 = hash(seed);
                const h2 = hash(seed + "x");
                const h3 = hash(seed + "y");
                const left =
                  5 +
                  i * bandWidth +
                  (h1 % 100) / 100 * bandWidth;
                const topOffset = -2 - (h2 % 24) / 4;
                const wiggleDuration = 0.35 + (h3 % 45) / 100;
                const wiggleDelay = (h2 % 40) / 100;
                const fallDuration = 2.2 + (h1 % 180) / 100;
                const fallDelay = (h2 % 50) / 100;
                return (
                  <span
                    key={`${burst.key}-${i}`}
                    className="leaf-fall absolute text-2xl opacity-90"
                    style={{
                      left: `${left}%`,
                      top: `${topOffset}rem`,
                      animationDuration: `${fallDuration}s`,
                      animationDelay: `${fallDelay}s`,
                    }}
                  >
                    <span
                      className="leaf-wiggle"
                      style={{
                        animationDuration: `${wiggleDuration}s`,
                        animationDelay: `${wiggleDelay}s`,
                      }}
                    >
                      🍃
                    </span>
                  </span>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TVMarketBlock({
  market,
  rank,
}: {
  market: RankedMarket;
  rank: number;
}) {
  const yesPercent = Math.round(market.probability * 100);
  const noPercent = 100 - yesPercent;

  return (
    <Link
      href={`/markets/${market.id}`}
      className="flex-1 min-h-0 flex min-w-0 overflow-hidden"
    >
      <div className="bg-card border border-border rounded px-2 py-2.5 hover:border-border/80 hover:bg-card-hover transition-all flex flex-col gap-1 w-full min-h-0 flex-1 overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0 flex-1 overflow-hidden">
            <span className="text-lg font-bold text-border tabular-nums shrink-0 w-4">
              {rank}
            </span>
            <h2 className="text-foreground font-medium text-lg leading-tight truncate min-w-0">
              {market.question}
            </h2>
          </div>
          <div className="text-lg font-bold tabular-nums leading-tight shrink-0 text-foreground">
            {yesPercent}%
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="text-yes font-medium truncate">
            {formatLeaves(market.recentVolume)} vol
          </span>
          <span className="truncate">
            {formatLeaves(market.volume)} vol
          </span>
        </div>
        <div className="flex h-1 w-full rounded-full overflow-hidden bg-border/30 gap-px">
          <div
            className="bg-yes/80 rounded-l-full transition-all duration-300"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-no/80 rounded-r-full transition-all duration-300"
            style={{ width: `${noPercent}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function FeaturedChart({
  marketId,
  data,
  currentProb,
  height = 200,
}: {
  marketId: string;
  data: ProbPoint[];
  currentProb: number;
  height?: number | "100%";
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
      <ResponsiveContainer width="100%" height={height}>
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
              new Date(v).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            }
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
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

  const firstTime = chartData[0]?.time ?? endTime;
  const timeSpan = endTime - firstTime;
  const isShortSpan = timeSpan < 24 * 60 * 60 * 1000;
  const firstDate = new Date(firstTime);
  const lastDate = new Date(endTime);
  const isSameDay =
    firstDate.getFullYear() === lastDate.getFullYear() &&
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getDate() === lastDate.getDate();

  const formatXTick = (v: number) => {
    const date = new Date(v);
    if (isSameDay || isShortSpan) {
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
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
          tickFormatter={formatXTick}
          stroke="var(--color-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke="var(--color-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "var(--color-border)" }}
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
      <div className="text-sm text-muted truncate mb-1.5">
        {marketQuestion}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-foreground font-medium">
            {trade.profiles?.username ?? "User"}
          </span>
          <span className="text-muted">
            {trade.type === "BUY" ? "bought" : trade.type === "REDEEM" ? "redeemed" : "sold"}
          </span>
          {trade.type === "REDEEM" ? (
            <span className="font-semibold text-accent">pairs</span>
          ) : (
            <span
              className={`font-semibold ${
                trade.outcome === "YES" ? "text-yes" : "text-no"
              }`}
            >
              {trade.outcome}
            </span>
          )}
        </div>
        <span className="text-xs text-muted shrink-0">
          {timeAgo(trade.created_at)}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted">
        <span>{formatLeaves(trade.amount)} <LeafIcon /></span>
        <span>{formatShares(trade.shares)} shares</span>
        <span>
          {formatProbability(trade.prob_before)} →{" "}
          {formatProbability(trade.prob_after)}
        </span>
      </div>
    </div>
  );
}
