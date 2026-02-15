import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import TradePanel from "@/components/trade-panel";
import ProbabilityChart from "@/components/probability-chart";
import RecentTrades from "@/components/recent-trades";
import MarketComments from "@/components/market-comments";
import { formatProbability, timeAgo, formatLeaves } from "@/lib/utils";
import type { Market, Position, Trade, CommentWithProfile } from "@/lib/types";

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

  // Fetch user's position, probability history, recent trades, comments, and profile in parallel
  const [positionResult, historyResult, tradesResult, commentsResult, profileResult, traderCountResult] =
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
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase
        .from("trades")
        .select("*, profiles(username)")
        .eq("market_id", id)
        .eq("is_rolled_back", false)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("comments")
        .select("*, profiles(username)")
        .eq("market_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      user
        ? supabase
            .from("profiles")
            .select("balance, is_admin")
            .eq("id", user.id)
            .single()
        : { data: null },
      supabase
        .from("positions")
        .select("user_id")
        .eq("market_id", id)
        .or("yes_shares.gt.0,no_shares.gt.0"),
    ]);

  const typedMarket = market as Market;
  const position = positionResult.data as Position | null;
  const profileData = profileResult.data as { balance: number; is_admin: boolean } | null;
  const balance = profileData?.balance ?? 0;
  const traderCount = traderCountResult.data?.length ?? 0;

  // Merge commenter positions into comments
  const commentsData = (commentsResult.data ?? []) as CommentWithProfile[];
  const commenterIds = [...new Set(commentsData.map((c) => c.user_id))];

  let commentsWithPositions: CommentWithProfile[] = commentsData;
  if (commenterIds.length > 0) {
    const { data: commenterPositions } = await supabase
      .from("positions")
      .select("user_id, yes_shares, no_shares")
      .eq("market_id", id)
      .in("user_id", commenterIds);

    if (commenterPositions) {
      const posMap: Record<string, { yes_shares: number; no_shares: number }> = {};
      for (const pos of commenterPositions) {
        posMap[pos.user_id] = { yes_shares: pos.yes_shares, no_shares: pos.no_shares };
      }
      commentsWithPositions = commentsData.map((c) => ({
        ...c,
        positions: posMap[c.user_id] ?? null,
      }));
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4 md:p-6 mb-6">
        <div className="flex flex-col gap-4">
          {/* Title and description */}
          <div>
            <h1 className="text-xl md:text-2xl font-bold mb-2">{typedMarket.question}</h1>
            {typedMarket.description && (
              <p className="text-muted text-sm">{typedMarket.description}</p>
            )}
          </div>

          {/* Mobile: Probabilities first, then metadata below */}
          <div className="md:hidden">
            <div className="flex items-center gap-8 justify-center mb-3">
              <div className="text-center">
                <div className="text-3xl font-bold text-yes">
                  {formatProbability(typedMarket.probability)}
                </div>
                <div className="text-xs text-muted mt-1">Yes</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-no">
                  {formatProbability(1 - typedMarket.probability)}
                </div>
                <div className="text-xs text-muted mt-1">No</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
              <span className="font-medium whitespace-nowrap">{formatLeaves(typedMarket.volume)} Vol.</span>
              <span className="whitespace-nowrap">{traderCount} {traderCount === 1 ? "trader" : "traders"}</span>
              <span className="whitespace-nowrap">{timeAgo(typedMarket.created_at)}</span>
              <span className="whitespace-nowrap">{commentsWithPositions.length} comment{commentsWithPositions.length !== 1 ? 's' : ''}</span>
              {typedMarket.status === "resolved" && (
                <span className="px-2 py-0.5 bg-border/50 rounded text-foreground text-xs font-medium whitespace-nowrap">
                  Resolved: {typedMarket.resolution}
                </span>
              )}
            </div>
          </div>

          {/* Desktop: Side by side layout */}
          <div className="hidden md:flex md:items-start md:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="font-medium whitespace-nowrap">{formatLeaves(typedMarket.volume)} Vol.</span>
              <span>•</span>
              <span className="whitespace-nowrap">{traderCount} {traderCount === 1 ? "trader" : "traders"}</span>
              <span>•</span>
              <span className="whitespace-nowrap">{timeAgo(typedMarket.created_at)}</span>
              <span>•</span>
              <span className="whitespace-nowrap">{commentsWithPositions.length} comment{commentsWithPositions.length !== 1 ? 's' : ''}</span>
              {typedMarket.status === "resolved" && (
                <>
                  <span>•</span>
                  <span className="px-2 py-0.5 bg-border/50 rounded text-foreground text-xs font-medium whitespace-nowrap">
                    Resolved: {typedMarket.resolution}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-6 shrink-0">
              <div className="text-center">
                <div className="text-3xl font-bold text-yes">
                  {formatProbability(typedMarket.probability)}
                </div>
                <div className="text-xs text-muted mt-1">Yes</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-no">
                  {formatProbability(1 - typedMarket.probability)}
                </div>
                <div className="text-xs text-muted mt-1">No</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top: Chart + Trade panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <ProbabilityChart data={historyResult.data ?? []} resolvedAt={typedMarket.resolved_at} />
        </div>
        <div className="lg:col-span-1">
          <TradePanel
            market={typedMarket}
            position={position}
            balance={balance}
            isLoggedIn={!!user}
          />
        </div>
      </div>

      {/* Bottom: Comments (left) + Recent Trades (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketComments
          marketId={id}
          comments={commentsWithPositions}
          isAdmin={profileData?.is_admin ?? false}
          currentUserId={user?.id}
        />
        <RecentTrades
          trades={(tradesResult.data ?? []) as (Trade & { profiles?: { username: string } })[]}
        />
      </div>
    </div>
  );
}
