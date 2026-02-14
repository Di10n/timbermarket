import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import TradePanel from "@/components/trade-panel";
import ProbabilityChart from "@/components/probability-chart";
import RecentTrades from "@/components/recent-trades";
import { formatProbability, timeAgo } from "@/lib/utils";
import type { Market, Position, Trade } from "@/lib/types";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch market
  const { data: market } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .single();

  if (!market) notFound();

  // Fetch user's position, probability history, and recent trades in parallel
  const [positionResult, historyResult, tradesResult, profileResult] =
    await Promise.all([
      user
        ? supabase
            .from("positions")
            .select("*")
            .eq("market_id", id)
            .eq("user_id", user.id)
            .single()
        : { data: null },
      supabase
        .from("probability_history")
        .select("probability, created_at")
        .eq("market_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("trades")
        .select("*, profiles(username)")
        .eq("market_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      user
        ? supabase
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .single()
        : { data: null },
    ]);

  const typedMarket = market as Market;
  const position = positionResult.data as Position | null;
  const balance = (profileResult.data as { balance: number } | null)?.balance ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-2">{typedMarket.question}</h1>
        {typedMarket.description && (
          <p className="text-muted text-sm mb-2">{typedMarket.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>Created {timeAgo(typedMarket.created_at)}</span>
          {typedMarket.status === "resolved" && (
            <span className="px-2 py-0.5 bg-border/50 rounded text-foreground text-xs">
              Resolved: {typedMarket.resolution}
            </span>
          )}
        </div>
      </div>

      {/* Probability display */}
      <div className="flex items-center gap-6 mb-6">
        <div className="text-center">
          <div className="text-4xl font-bold text-yes">
            {formatProbability(typedMarket.probability)}
          </div>
          <div className="text-xs text-muted mt-1">Yes</div>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-no">
            {formatProbability(1 - typedMarket.probability)}
          </div>
          <div className="text-xs text-muted mt-1">No</div>
        </div>
      </div>

      {/* Main content: Chart + Trade panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ProbabilityChart data={historyResult.data ?? []} resolvedAt={typedMarket.resolved_at} />
          <RecentTrades
            trades={(tradesResult.data ?? []) as (Trade & { profiles?: { username: string } })[]}
          />
        </div>

        <div className="lg:col-span-1">
          <TradePanel
            market={typedMarket}
            position={position}
            balance={balance}
          />
        </div>
      </div>
    </div>
  );
}
