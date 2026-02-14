import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import HomeTopBar from "@/components/home-top-bar";
import HomeCarousel from "@/components/home-carousel";
import Leaderboard from "@/components/leaderboard";
import RecentTrades from "@/components/recent-trades";
import ForestFooter from "@/components/forest-footer";
import MarketCard from "@/components/market-card";
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

  const [marketsResult, tradesResult, profileResult, profilesResult, allPositionsResult, userPositionsResult] =
    await Promise.all([
      supabase
        .from("markets")
        .select("*")
        .eq("status", "active")
        .order("volume", { ascending: false })
        .limit(12),
      supabase
        .from("trades")
        .select("*, profiles(username), markets(question)")
        .order("created_at", { ascending: false })
        .limit(15),
      user
        ? supabase
            .from("profiles")
            .select("username, balance")
            .eq("id", user.id)
            .single()
        : { data: null },
      supabase
        .from("profiles")
        .select("id, username, balance")
        .eq("is_approved", true),
      serviceClient
        .from("positions")
        .select("user_id, yes_shares, no_shares, markets(probability)")
        .or("yes_shares.gt.0,no_shares.gt.0"),
      user
        ? supabase
            .from("positions")
            .select("market_id")
            .eq("user_id", user.id)
            .or("yes_shares.gt.0,no_shares.gt.0")
        : { data: [] },
    ]);

  const topMarkets = (marketsResult.data ?? []) as Market[];
  const recentTrades = (tradesResult.data ?? []) as (Trade & {
    profiles?: { username: string };
    markets?: { question: string } | null;
  })[];
  const profile = profileResult.data as { username: string; balance: number } | null;

  // Calculate portfolio values for leaderboard
  const profiles = (profilesResult.data ?? []) as { id: string; username: string; balance: number }[];
  const allPositions = (allPositionsResult.data ?? []) as {
    user_id: string;
    yes_shares: number;
    no_shares: number;
    markets: { probability: number }[];
  }[];

  const leaderList = profiles
    .map((p) => {
      const userPositions = allPositions.filter((pos) => pos.user_id === p.id);
      const positionsValue = userPositions.reduce((sum, pos) => {
        const prob = pos.markets?.[0]?.probability ?? 0.5;
        return sum + pos.yes_shares * prob + pos.no_shares * (1 - prob);
      }, 0);
      return {
        username: p.username,
        balance: p.balance + positionsValue,
      };
    })
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);

  // Build carousel: up to 3 markets the user has traded on, then fill to 5 with top-volume
  const userMarketIds = new Set(
    ((userPositionsResult.data ?? []) as { market_id: string }[]).map((p) => p.market_id)
  );
  const userTradedMarkets = topMarkets
    .filter((m) => userMarketIds.has(m.id))
    .slice(0, 3);
  const userTradedIds = new Set(userTradedMarkets.map((m) => m.id));
  const remainingSlots = 5 - userTradedMarkets.length;
  const volumeMarkets = topMarkets
    .filter((m) => !userTradedIds.has(m.id))
    .slice(0, remainingSlots);
  const carouselMarkets = [...userTradedMarkets, ...volumeMarkets];

  const marketIds = topMarkets.map((m) => m.id);
  const historyResult =
    marketIds.length > 0
      ? await supabase
          .from("probability_history")
          .select("market_id, probability, created_at")
          .in("market_id", marketIds)
          .order("created_at", { ascending: true })
      : { data: [] };

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
    <div className="min-h-screen flex flex-col">
      <HomeTopBar user={user} profile={user ? profile : null} />

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full min-h-0">
        <div className="flex gap-8 flex-col lg:flex-row">
          {/* Left: carousel + markets ~70% */}
          <div className="flex-[7] min-w-0 flex flex-col min-h-0">
            <HomeCarousel marketsWithHistory={carouselWithHistory} />

            <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Markets</h2>
              <div className="space-y-4">
                {topMarkets.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
            </div>
          </div>

          {/* Right: leaderboard + recent trades ~30% */}
          <div className="flex-[3] flex flex-col gap-6 lg:min-w-[200px]">
            <Leaderboard leaders={leaderList} />
            <RecentTrades trades={recentTrades} compact />
          </div>
        </div>
      </main>

      <ForestFooter />
    </div>
  );
}
