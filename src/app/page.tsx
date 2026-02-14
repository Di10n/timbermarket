import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeTopBar from "@/components/home-top-bar";
import HomeCarousel from "@/components/home-carousel";
import Leaderboard from "@/components/leaderboard";
import RecentTrades from "@/components/recent-trades";
import ForestFooter from "@/components/forest-footer";
import type { Market, Trade } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
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

  const [marketsResult, tradesResult, profileResult, leadersResult] = await Promise.all([
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
    supabase.rpc("get_leaderboard", { p_limit: 10 }),
  ]);

  const topMarkets = (marketsResult.data ?? []) as Market[];
  const recentTrades = (tradesResult.data ?? []) as (Trade & {
    profiles?: { username: string };
    markets?: { question: string } | null;
  })[];
  const profile = profileResult.data as { username: string; balance: number } | null;
  const leaderList =
    leadersResult.error || !leadersResult.data
      ? []
      : (leadersResult.data as { username: string; balance: number }[]);

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
  const marketsWithHistory = topMarkets.map((market) => ({
    market,
    history: historyByMarketId.get(market.id) ?? [],
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <HomeTopBar user={user} profile={user ? profile : null} />

      <main className="max-w-4xl mx-auto px-4 py-8 flex-1 w-full min-h-0">
        <div className="flex gap-8 flex-col lg:flex-row">
          {/* Left: carousel ~70% (height from content, not full viewport) */}
          <div className="flex-[7] min-w-0 flex flex-col min-h-0">
            <HomeCarousel marketsWithHistory={marketsWithHistory} />
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
