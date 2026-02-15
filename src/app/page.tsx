import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import HomeTopBar from "@/components/home-top-bar";
import HomeCarousel from "@/components/home-carousel";
import Leaderboard from "@/components/leaderboard";
import RecentTrades from "@/components/recent-trades";
import MarketCard from "@/components/market-card";
import SuggestMarket from "@/components/suggest-market";
import RecentComments from "@/components/recent-comments";
import Footer from "@/components/footer";
import type { Market, Trade } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged in but not approved: send to verify
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, balance, is_approved")
      .eq("id", user.id)
      .single();

    if (!profile?.is_approved) {
      redirect("/verify");
    }
  }

  const [marketsResult, tradesResult, profileResult, allProfilesResult, allPositionsResult, userPositionsResult, recentCommentsResult] =
    await Promise.all([
      supabase
        .from("markets")
        .select("*")
        .in("status", ["active", "resolved"])
        .order("volume", { ascending: false })
        .limit(30),
      supabase
        .from("trades")
        .select("*, profiles(username), markets(question)")
        .eq("is_rolled_back", false)
        .order("created_at", { ascending: false })
        .limit(15),
      user
        ? supabase
            .from("profiles")
            .select("username, balance, is_admin")
            .eq("id", user.id)
            .single()
        : { data: null },
      supabase
        .from("profiles")
        .select("id, username, balance")
        .eq("is_approved", true),
      serviceClient
        .from("positions")
        .select("user_id, market_id, yes_shares, no_shares, markets(probability, status)")
        .or("yes_shares.gt.0,no_shares.gt.0"),
      user
        ? supabase
            .from("positions")
            .select("market_id")
            .eq("user_id", user.id)
            .or("yes_shares.gt.0,no_shares.gt.0")
        : { data: [] },
      supabase
        .from("comments")
        .select("id, content, created_at, market_id, profiles(username), markets(question)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const topMarkets = (marketsResult.data ?? []).sort((a: Market, b: Market) => {
    if (a.status === "resolved" && b.status !== "resolved") return 1;
    if (a.status !== "resolved" && b.status === "resolved") return -1;
    return 0; // preserve volume order within each group
  }) as Market[];
  const recentTrades = (tradesResult.data ?? []) as (Trade & {
    profiles?: { username: string };
    markets?: { question: string } | null;
  })[];
  const profile = profileResult.data as { username: string; balance: number; is_admin?: boolean } | null;

  // Build leaderboard with portfolio values (mirrors leaderboard page logic)
  const recentComments = ((recentCommentsResult.data ?? []) as any[]).map((c) => ({
    id: c.id as string,
    content: c.content as string,
    created_at: c.created_at as string,
    market_id: c.market_id as string,
    profiles: c.profiles as { username: string },
    markets: c.markets as { question: string },
  }));

  const allProfiles = (allProfilesResult.data ?? []) as { id: string; username: string; balance: number }[];
  const allPositions = (allPositionsResult.data ?? []) as any[];
  const leaderList = allProfiles
    .map((p) => {
      const userPos = allPositions.filter((pos: any) => pos.user_id === p.id && pos.markets?.status === 'active');
      const posValue = userPos.reduce((sum: number, pos: any) => {
        const prob = pos.markets?.probability ?? 0.5;
        return sum + pos.yes_shares * prob + pos.no_shares * (1 - prob);
      }, 0);
      return { username: p.username, portfolio_value: p.balance + posValue };
    })
    .sort((a, b) => b.portfolio_value - a.portfolio_value)
    .slice(0, 5);

  // Count traders per market from positions
  const traderCountMap = new Map<string, number>();
  for (const pos of allPositions) {
    traderCountMap.set(pos.market_id, (traderCountMap.get(pos.market_id) ?? 0) + 1);
  }

  // Build carousel: up to 3 markets the user has traded on, then featured market, then fill to 5 with top-volume
  const userMarketIds = new Set(
    ((userPositionsResult.data ?? []) as { market_id: string }[]).map((p) => p.market_id)
  );
  const userTradedMarkets = topMarkets
    .filter((m) => userMarketIds.has(m.id))
    .slice(0, 3);
  const carouselIds = new Set(userTradedMarkets.map((m) => m.id));

  const featuredMarket = topMarkets.find((m) => m.is_featured && !carouselIds.has(m.id));
  if (featuredMarket) {
    carouselIds.add(featuredMarket.id);
  }

  const remainingSlots = 5 - userTradedMarkets.length - (featuredMarket ? 1 : 0);
  const volumeMarkets = topMarkets
    .filter((m) => !carouselIds.has(m.id))
    .slice(0, remainingSlots);
  const carouselMarkets = [...(featuredMarket ? [featuredMarket] : []), ...userTradedMarkets, ...volumeMarkets];

  const marketIds = topMarkets.map((m) => m.id);

  // Fetch probability history and comment counts in parallel
  const [historyResult, commentCountsResult] = await Promise.all([
    marketIds.length > 0
      ? supabase
          .from("probability_history")
          .select("market_id, probability, created_at")
          .in("market_id", marketIds)
          .order("created_at", { ascending: true })
          .limit(10000)
      : { data: [] },
    marketIds.length > 0
      ? supabase
          .from("comments")
          .select("market_id")
          .in("market_id", marketIds)
      : { data: [] },
  ]);

  // Count comments per market
  const commentCountMap = new Map<string, number>();
  (commentCountsResult.data ?? []).forEach((comment: any) => {
    const count = commentCountMap.get(comment.market_id) || 0;
    commentCountMap.set(comment.market_id, count + 1);
  });

  const historyRows = (historyResult.data ?? []) as {
    market_id: string;
    probability: number;
    created_at: string;
  }[];
  const historyByMarketId = new Map<string, { probability: number; created_at: string }[]>();
  for (const row of historyRows) {
    const list = historyByMarketId.get(row.market_id) ?? [];
    list.push({ probability: row.probability, created_at: row.created_at });
    historyByMarketId.set(row.market_id, list);
  }
  const carouselWithHistory = carouselMarkets.map((market) => ({
    market,
    history: historyByMarketId.get(market.id) ?? [],
  }));

  return (
    <div className="min-h-screen">
      <HomeTopBar user={user} profile={user ? profile : null} />

      <main className="max-w-6xl mx-auto px-3 py-4 lg:px-4 lg:py-8 flex-1 w-full min-h-0">
        {/* Carousel and leaderboard side by side */}
        <div className="flex flex-col gap-4 lg:relative lg:block mb-6 lg:mb-8">
          {/* Left: Carousel – in normal flow, defines the row height */}
          <div className="min-w-0 lg:mr-88">
            <HomeCarousel marketsWithHistory={carouselWithHistory} />
          </div>

          {/* Right: leaderboard + recent chat – absolute on desktop, matches carousel height */}
          <div className="flex flex-col gap-4 lg:absolute lg:top-0 lg:right-0 lg:bottom-14 lg:w-80 overflow-hidden">
            <Leaderboard leaders={leaderList} />
            <RecentComments comments={recentComments} isLoggedIn={!!user} />
          </div>
        </div>

        {/* Markets grid and recent trades side by side */}
        <div className="flex gap-4 lg:gap-8 flex-col lg:flex-row">
          {/* Left: Markets grid */}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-foreground mb-4 lg:mb-6">Markets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topMarkets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  traderCount={traderCountMap.get(market.id) ?? 0}
                  commentCount={commentCountMap.get(market.id) || 0}
                />
              ))}
              <SuggestMarket isLoggedIn={!!user} />
            </div>
          </div>

          {/* Right: recent trades */}
          <div className="w-full lg:w-80">
            <RecentTrades trades={recentTrades} compact />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
