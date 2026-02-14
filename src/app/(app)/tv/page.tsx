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
  recentShares: number; // total shares traded in window (what we call "recent trades")
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
  const supabaseRef = useRef(createClient());

  const fetchAndRank = useCallback(async () => {
    const supabase = supabaseRef.current;
    const since = new Date(Date.now() - RANKING_WINDOW).toISOString();

    const [marketsRes, featuredRes, windowRes, feedRes] = await Promise.all([
      supabase.from("markets").select("*").eq("status", "active"),
      supabase
        .from("markets")
        .select("*")
        .eq("status", "active")
        .eq("is_featured", true)
        .maybeSingle(),
      supabase
        .from("trades")
        .select("market_id, amount, created_at, shares")
        .gte("created_at", since),
      supabase
        .from("trades")
        .select("*, profiles(username), markets(question)")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (marketsRes.data) {
      const volumeMap: Record<string, number> = {};
      const sharesMap: Record<string, number> = {};
      if (windowRes.data) {
        for (const t of windowRes.data) {
          volumeMap[t.market_id] =
            (volumeMap[t.market_id] ?? 0) + Number(t.amount);
          sharesMap[t.market_id] =
            (sharesMap[t.market_id] ?? 0) + Number(t.shares);
        }
      }

      const ranked: RankedMarket[] = (marketsRes.data as Market[]).map(
        (m) => ({
          ...m,
          recentVolume: volumeMap[m.id] ?? 0,
          recentShares: sharesMap[m.id] ?? 0,
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

      // Featured: admin-selected market (is_featured = true)
      const featuredRow = featuredRes.data as Market | null;
      const featured =
        featuredRow
          ? {
              ...featuredRow,
              recentVolume: volumeMap[featuredRow.id] ?? 0,
              recentShares: sharesMap[featuredRow.id] ?? 0,
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

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAndRank();
    const interval = setInterval(fetchAndRank, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAndRank]);

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

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/timbermarket_logo.svg"
            alt="TimberMarket"
            width={36}
            height={36}
            className="shrink-0"
          />
          <span className="text-accent font-bold text-lg font-[family-name:var(--font-gaegu)]">
            TimberMarket
          </span>
        </Link>
        <span className="text-muted text-xs">
          Top {TOP_N} by 10 min volume
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: top = featured placeholder, bottom = top 5 list */}
        <div className="w-2/3 flex flex-col border-r border-border/50">
          {/* Top half: featured market (admin-selected) */}
          <div className="h-1/2 flex flex-col min-h-0 border-b border-border/50">
            {featuredMarket ? (
              <Link
                href={`/markets/${featuredMarket.id}`}
                className="flex-1 flex flex-col min-h-0 min-w-0 p-4 bg-card/30 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
                  <h2 className="text-base font-bold text-foreground leading-tight line-clamp-2 flex-1 min-w-0">
                    {featuredMarket.question}
                  </h2>
                  <div
                    className={`text-2xl font-bold tabular-nums shrink-0 ${
                      featuredMarket.probability >= 0.5 ? "text-yes" : "text-no"
                    }`}
                  >
                    {Math.round(featuredMarket.probability * 100)}%
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted mb-3 shrink-0">
                  <span>Created {timeAgo(featuredMarket.created_at)}</span>
                  <span className="text-accent font-medium">
                    {formatShares(featuredMarket.recentShares)} shares in last 10 min
                  </span>
                  <span>{formatLeaves(featuredMarket.volume)} total volume</span>
                </div>
                <div className="flex-1 min-h-0 w-full rounded-lg overflow-hidden border border-border/50">
                  <FeaturedChart
                    marketId={featuredMarket.id}
                    data={historyByMarket[featuredMarket.id] ?? []}
                    currentProb={featuredMarket.probability}
                    height="100%"
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
          {/* Bottom half: top 5 most traded (no scroll, fit in half) */}
          <div className="h-1/2 flex flex-col min-h-0">
            <div className="px-4 py-1.5 border-b border-border/50 shrink-0">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
                Top {LIST_COUNT} by volume
              </h2>
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-2 gap-1.5">
              {top10.length === 0 ? (
                <div className="flex items-center justify-center flex-1">
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
      className="flex-1 min-h-0 flex min-w-0"
    >
      <div className="bg-card border border-border rounded-lg px-2 py-1.5 hover:border-border/80 hover:bg-card-hover transition-all flex items-center justify-between gap-2 w-full min-h-0 flex-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-border tabular-nums shrink-0 w-3.5">
              {rank}
            </span>
            <h2 className="text-foreground font-medium text-[11px] leading-tight truncate">
              {market.question}
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
            <span className="text-accent font-medium">
              {formatShares(market.recentShares)} shares
            </span>
            <span>{formatLeaves(market.volume)} vol</span>
          </div>
          <div className="flex h-1 rounded-full overflow-hidden bg-border/30 gap-px mt-0.5">
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
        <div
          className={`text-base font-bold tabular-nums leading-tight shrink-0 ${
            market.probability >= 0.5 ? "text-yes" : "text-no"
          }`}
        >
          {yesPercent}%
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
        <span>{formatLeaves(trade.amount)} 🍃</span>
        <span>{formatShares(trade.shares)} shares</span>
        <span>
          {formatProbability(trade.prob_before)} →{" "}
          {formatProbability(trade.prob_after)}
        </span>
      </div>
    </div>
  );
}
