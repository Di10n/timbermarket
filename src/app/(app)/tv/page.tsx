"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Market, Trade } from "@/lib/types";
import {
  formatProbability,
  formatLeaves,
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
const TICKER_SPEED = 60; // pixels per second

interface TradeWithContext extends Trade {
  profiles?: { username: string };
  markets?: { question: string };
}

interface RankedMarket extends Market {
  recentVolume: number;
  traderCount: number;
}

interface CommentWithContext {
  id: string;
  content: string;
  created_at: string;
  profiles?: { username: string } | { username: string }[];
  markets?: { question: string } | { question: string }[];
}

interface ProbPoint {
  probability: number;
  created_at: string;
}

export default function TVPage() {
  const [markets, setMarkets] = useState<RankedMarket[]>([]);
  const [featuredMarket, setFeaturedMarket] = useState<RankedMarket | null>(
    null
  );
  const [historyByMarket, setHistoryByMarket] = useState<
    Record<string, ProbPoint[]>
  >({});
  const [trades, setTrades] = useState<TradeWithContext[]>([]);
  const [comments, setComments] = useState<CommentWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [tradeCount, setTradeCount] = useState<number | null>(null);
  const [countdown, setCountdown] = useState("");
  const [countdownDone, setCountdownDone] = useState(false);
  const [ambientLeaves, setAmbientLeaves] = useState<
    { id: number; left: number; fallDuration: number; swayDuration: number; swayDelay: number; size: number; rotation: number }[]
  >([]);
  const ambientIdRef = useRef(0);
  const supabaseRef = useRef(createClient());

  const fetchAndRank = useCallback(async () => {
    const supabase = supabaseRef.current;
    const since = new Date(Date.now() - RANKING_WINDOW).toISOString();

    const [marketsRes, featuredRes, windowRes, feedRes, countRes, positionsRes, commentsRes, tradeCountRes] =
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
          .eq("is_rolled_back", false)
          .gte("created_at", since),
        supabase
          .from("trades")
          .select("*, profiles(username), markets(question)")
          .eq("is_rolled_back", false)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("positions")
          .select("market_id"),
        supabase
          .from("comments")
          .select("id, content, created_at, profiles(username), markets(question)")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("trades")
          .select("id", { count: "exact", head: true })
          .eq("is_rolled_back", false),
      ]);

    if (marketsRes.data) {
      const volumeMap: Record<string, number> = {};
      if (windowRes.data) {
        for (const t of windowRes.data) {
          volumeMap[t.market_id] =
            (volumeMap[t.market_id] ?? 0) + Number(t.amount);
        }
      }

      const traderMap: Record<string, number> = {};
      if (positionsRes.data) {
        for (const p of positionsRes.data) {
          traderMap[p.market_id] = (traderMap[p.market_id] ?? 0) + 1;
        }
      }

      const ranked: RankedMarket[] = (marketsRes.data as Market[]).map(
        (m) => ({
          ...m,
          recentVolume: volumeMap[m.id] ?? 0,
          traderCount: traderMap[m.id] ?? 0,
        })
      );
      ranked.sort((a, b) => a.question.localeCompare(b.question));

      setMarkets(ranked);

      const featuredRow = featuredRes.data as Market | null;
      const featured =
        featuredRow
          ? {
              ...featuredRow,
              recentVolume: volumeMap[featuredRow.id] ?? 0,
              traderCount: traderMap[featuredRow.id] ?? 0,
            }
          : null;
      setFeaturedMarket(featured);

      const ids = ranked.map((m) => m.id);
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

    if (commentsRes.data) {
      setComments(commentsRes.data as CommentWithContext[]);
    }

    if (countRes.count != null) {
      setUserCount(countRes.count);
    }

    if (tradeCountRes.count != null) {
      setTradeCount(tradeCountRes.count);
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        () => fetchAndRank()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchAndRank]);

  // Countdown to 9:30 AM PST on Feb 15, 2026
  useEffect(() => {
    const target = new Date("2026-02-15T09:30:00-08:00").getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setCountdown("0h 0m 0s");
        setCountdownDone(true);
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Ambient falling leaves
  useEffect(() => {
    const spawnInterval = setInterval(() => {
      const batch = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => {
        const id = ambientIdRef.current++;
        return {
          id,
          left: Math.random() * 100,
          fallDuration: 8 + Math.random() * 6,
          swayDuration: 3 + Math.random() * 3,
          swayDelay: Math.random() * 2,
          size: 30 + Math.random() * 20,
          rotation: Math.random() * 360,
        };
      });
      setAmbientLeaves((prev) => [...prev, ...batch]);
      for (const leaf of batch) {
        setTimeout(() => {
          setAmbientLeaves((prev) => prev.filter((l) => l.id !== leaf.id));
        }, (leaf.fallDuration + 1) * 1000);
      }
    }, 2000);

    return () => {
      clearInterval(spawnInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-[100]">
        <Image
          src="/timbermarket_logo.svg"
          alt="Timbermarket"
          width={120}
          height={120}
          className="animate-pulse"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-[100] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="relative flex items-center justify-between px-10 py-4 shrink-0 tv-header-gradient">
        <Link href="/" className="flex items-center gap-5">
          <Image
            src="/timbermarket_logo.svg"
            alt="Timbermarket"
            width={72}
            height={72}
            className="shrink-0"
          />
          <span className="text-accent font-bold text-5xl font-[family-name:var(--font-gaegu)]">
            Timbermarket
          </span>
        </Link>
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="text-base font-bold uppercase tracking-widest text-muted">
            {countdownDone ? "Hacking Ended" : "Hacking Ends In"}
          </span>
          <span className={`text-7xl font-black tabular-nums font-[family-name:var(--font-gaegu)] ${countdownDone ? "text-no" : "text-accent"}`}>
            {countdown}
          </span>
        </div>
        <div className="flex items-center gap-8">
          {userCount != null && (
            <span className="text-muted text-xl tabular-nums">
              <span className="text-foreground font-bold text-4xl font-[family-name:var(--font-gaegu)]">
                {userCount.toLocaleString()}
              </span>{" "}
              trader{userCount !== 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-3">
            <span className="tv-live-dot" />
            <span className="text-lg font-semibold uppercase tracking-widest text-accent">
              Live
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Recent trades */}
        <div className="w-1/4 flex flex-col overflow-hidden relative border-r border-border/50">
          <div className="px-5 py-5 shrink-0 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-lg font-bold uppercase tracking-widest text-muted">
              Recent Trades
            </h2>
            {tradeCount != null && (
              <span className="text-muted text-base tabular-nums">
                <span className="text-foreground font-bold text-2xl font-[family-name:var(--font-gaegu)]">
                  {tradeCount.toLocaleString()}
                </span>{" "}
                total
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide relative tv-trades-fade">
            {trades.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted text-xl">No trades yet</p>
              </div>
            ) : (
              <div>
                {trades.map((trade) => (
                  <TVTradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center panel: featured market + top markets */}
        <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">
          {/* Featured market */}
          <div className="flex-[0_0_42%] flex flex-col min-h-0 overflow-hidden border-b border-border/50">
            {featuredMarket ? (
              <Link
                href={`/markets/${featuredMarket.id}`}
                className="flex-1 flex flex-col min-h-0 min-w-0 px-8 py-6 tv-featured-bg transition-colors group"
              >
                <div className="flex items-center gap-3 mb-4 shrink-0">
                  <span className="text-sm font-bold uppercase tracking-widest text-accent bg-accent/10 px-3 py-1.5 rounded-full">
                    Featured
                  </span>
                  {featuredMarket.recentVolume > 0 && (
                    <span className="text-sm font-medium uppercase tracking-wider text-yes bg-yes/10 px-3 py-1.5 rounded-full tv-trending-pulse">
                      Trending
                    </span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-8 mb-4 shrink-0">
                  <h2 className="text-4xl font-bold text-foreground leading-tight line-clamp-2 flex-1 min-w-0 group-hover:text-accent transition-colors">
                    {featuredMarket.question}
                  </h2>
                  <div className="shrink-0 flex flex-col items-end">
                    <div
                      className={`text-7xl font-black tabular-nums leading-none ${
                        featuredMarket.probability >= 0.5 ? "text-yes" : "text-no"
                      }`}
                    >
                      {Math.round(featuredMarket.probability * 100)}%
                    </div>
                    <span className="text-lg text-muted mt-1">chance</span>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-xl text-muted mb-4 shrink-0">
                  <span className="flex items-center gap-1">
                    volume {formatLeaves(featuredMarket.volume)} <LeafIcon />
                  </span>
                  <span className="text-border">|</span>
                  <span>
                    {featuredMarket.traderCount} trader{featuredMarket.traderCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-border/50 bg-background/30">
                  <FeaturedChart
                    marketId={featuredMarket.id}
                    data={historyByMarket[featuredMarket.id] ?? []}
                    currentProb={featuredMarket.probability}
                    height="100%"
                  />
                </div>
              </Link>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 bg-card/20">
                <p className="text-muted text-xl">
                  No featured market (set one in Admin)
                </p>
              </div>
            )}
          </div>

          {/* Top markets list — ticker tape */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="px-6 pt-5 pb-3 shrink-0">
              <h3 className="text-lg font-bold uppercase tracking-widest text-muted">
                Other Markets ({markets.filter((m) => !featuredMarket || m.id !== featuredMarket.id).length})
              </h3>
            </div>
            {markets.filter((m) => !featuredMarket || m.id !== featuredMarket.id).length === 0 ? (
              <div className="flex items-center justify-center flex-1 min-h-0">
                <p className="text-muted text-xl">No active markets</p>
              </div>
            ) : (
              <TVMarketTicker
                markets={markets.filter((m) => !featuredMarket || m.id !== featuredMarket.id)}
              />
            )}
          </div>
        </div>

        {/* Right panel: Recent chat messages */}
        <div className="w-1/4 flex flex-col overflow-hidden relative border-l border-border/50">
          <div className="px-5 py-5 shrink-0 border-b border-border/50">
            <h2 className="text-lg font-bold uppercase tracking-widest text-muted">
              Chat
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide relative tv-trades-fade">
            {comments.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted text-xl">No messages yet</p>
              </div>
            ) : (
              <div>
                {comments.map((comment) => (
                  <TVCommentRow key={comment.id} comment={comment} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR code in bottom-right corner, spanning the chat column width */}
      <div className="absolute bottom-0 right-0 w-1/4 z-30 p-4">
        <div className="rounded-xl overflow-hidden shadow-lg border border-border/50 bg-white p-3">
          <Image
            src="/code.png"
            alt="QR Code"
            width={400}
            height={400}
            className="w-full h-auto"
          />
        </div>
      </div>

      {/* Ambient falling SVG leaves overlay */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden z-20"
        aria-hidden
      >
        {ambientLeaves.map((leaf) => (
          <div
            key={leaf.id}
            className="ambient-leaf-fall absolute"
            style={{
              left: `${leaf.left}%`,
              top: '-60px',
              ['--fall-duration' as string]: `${leaf.fallDuration}s`,
              opacity: 0.55,
            }}
          >
            <div
              className="ambient-leaf-sway"
              style={{
                ['--sway-duration' as string]: `${leaf.swayDuration}s`,
                ['--sway-delay' as string]: `${leaf.swayDelay}s`,
              }}
            >
              <img
                src="/leaves.svg"
                alt=""
                width={leaf.size}
                height={leaf.size}
                style={{ transform: `rotate(${leaf.rotation}deg)` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TVMarketTicker({ markets }: { markets: RankedMarket[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    if (!innerRef.current || !containerRef.current) return;
    const children = innerRef.current.children;
    if (children.length === 0) return;
    const singleCopy = children[0] as HTMLElement;
    const h = singleCopy.offsetHeight;
    const containerH = containerRef.current.offsetHeight;
    setContentHeight(h);
    // Need enough copies so that after scrolling one copy off the top,
    // the remaining copies still fill the visible container.
    setCopies(h > 0 ? Math.ceil(containerH / h) + 1 : 2);
  }, [markets]);

  const duration = contentHeight > 0 ? contentHeight / TICKER_SPEED : 20;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-hidden relative px-4 pb-3"
    >
      <div
        ref={innerRef}
        className="tv-ticker-scroll"
        style={{
          animationDuration: `${duration}s`,
          ["--ticker-distance" as string]: `${contentHeight}px`,
        }}
      >
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 pb-3">
            {markets.map((market) => (
              <TVMarketTickerItem key={`${i}-${market.id}`} market={market} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TVMarketTickerItem({ market }: { market: RankedMarket }) {
  const yesPercent = Math.round(market.probability * 100);
  const noPercent = 100 - yesPercent;

  return (
    <Link
      href={`/markets/${market.id}`}
      className="min-w-0 overflow-hidden group shrink-0"
    >
      <div className="bg-card/60 border border-border/40 rounded-lg hover:bg-card-hover hover:border-border/80 transition-all flex flex-col w-full overflow-hidden">
        <div className="flex items-center justify-between gap-4 min-w-0 px-5 pt-3 pb-1.5">
          <h2 className="text-foreground font-semibold text-xl leading-tight truncate min-w-0 flex-1 group-hover:text-accent transition-colors">
            {market.question}
          </h2>
          <div
            className={`text-2xl font-black tabular-nums leading-tight shrink-0 ${
              yesPercent >= 50 ? "text-yes" : "text-no"
            }`}
          >
            {yesPercent}%
          </div>
        </div>
        <div className="flex items-center gap-4 px-5 pb-2.5 text-sm text-muted">
          <span className="flex items-center gap-1">
            volume {formatLeaves(market.volume)} <LeafIcon />
          </span>
          <span>
            {market.traderCount} trader{market.traderCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden bg-border/20 gap-px rounded-b-lg">
          <div
            className="bg-yes transition-all duration-500"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-no transition-all duration-500"
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
              <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.35} />
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
            fontSize={16}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="var(--color-muted)"
            fontSize={16}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke="var(--color-yes)"
            fill={`url(#${gradId})`}
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  const rawData = data.map((p) => ({
    time: new Date(p.created_at).getTime(),
    probability: Math.round(p.probability * 100),
  }));
  const endTime = Date.now();
  const last = rawData[rawData.length - 1];
  if (last && last.time < endTime) {
    rawData.push({ time: endTime, probability: last.probability });
  }

  const chartData: { time: number; probability: number }[] = [];
  const TARGET_POINTS = 200;
  if (rawData.length >= 2) {
    const totalSpan = rawData[rawData.length - 1].time - rawData[0].time;
    const step = totalSpan / TARGET_POINTS;
    for (let i = 0; i < rawData.length - 1; i++) {
      const curr = rawData[i];
      const next = rawData[i + 1];
      chartData.push(curr);
      if (step > 0) {
        let t = curr.time + step;
        while (t < next.time) {
          chartData.push({ time: t, probability: curr.probability });
          t += step;
        }
      }
    }
    chartData.push(rawData[rawData.length - 1]);
  } else {
    chartData.push(...rawData);
  }

  const firstTime = rawData[0]?.time ?? endTime;
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
            <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.35} />
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
          strokeWidth={2.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TVTradeRow({ trade }: { trade: TradeWithContext }) {
  const marketQuestion = trade.markets?.question ?? "Unknown market";
  const isYes = trade.outcome === "YES";
  const isRedeem = trade.type === "REDEEM";
  const isBullish = trade.prob_after > trade.prob_before;

  return (
    <div className="tv-trade-row px-5 py-2.5 transition-colors relative">
      <div
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${
          isRedeem ? "bg-accent" : isBullish ? "bg-yes" : "bg-no"
        }`}
      />
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-base text-muted truncate min-w-0 flex-1 mr-2">
          {marketQuestion}
        </div>
        <span className="text-base text-muted shrink-0 tabular-nums">
          {timeAgo(trade.created_at)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xl">
          <span className="text-foreground font-semibold">
            {trade.profiles?.username ?? "User"}
          </span>
          <span
            className={`text-sm font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              trade.type === "BUY"
                ? "bg-yes/10 text-yes"
                : trade.type === "REDEEM"
                  ? "bg-accent/10 text-accent"
                  : "bg-no/10 text-no"
            }`}
          >
            {trade.type === "BUY" ? "Buy" : trade.type === "REDEEM" ? "Redeem" : "Sell"}
          </span>
          {!isRedeem && (
            <span
              className={`font-semibold ${
                isYes ? "text-yes" : "text-no"
              }`}
            >
              {trade.outcome}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-base text-muted shrink-0">
          <span className="flex items-center gap-1">
            {formatLeaves(trade.amount)} <LeafIcon />
          </span>
          <span className="tabular-nums">
            {formatProbability(trade.prob_before)} → {formatProbability(trade.prob_after)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TVCommentRow({ comment }: { comment: CommentWithContext }) {
  const profile = Array.isArray(comment.profiles)
    ? comment.profiles[0]
    : comment.profiles;
  const market = Array.isArray(comment.markets)
    ? comment.markets[0]
    : comment.markets;

  return (
    <div className="tv-trade-row px-5 py-1.5 transition-colors">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-base text-muted truncate min-w-0 flex-1 mr-2">
          {market?.question ?? "Unknown market"}
        </div>
        <span className="text-base text-muted shrink-0 tabular-nums">
          {timeAgo(comment.created_at)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-lg text-foreground font-semibold shrink-0">
          {profile?.username ?? "User"}
        </span>
        <span className="text-base text-foreground truncate min-w-0">
          {comment.content}
        </span>
      </div>
    </div>
  );
}
