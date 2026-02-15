import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatLeaves } from "@/lib/utils";
import PortfolioTabs from "@/components/portfolio-tabs";
import type { PositionWithMarket, TradeWithMarket } from "@/lib/types";
import LeafIcon from "@/components/leaf-icon";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  // Find user by username
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, balance")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  const [positionsResult, tradesResult, allTradesResult] = await Promise.all([
    supabase
      .from("positions")
      .select("*, markets(question, probability, status, resolution)")
      .eq("user_id", profile.id),
    supabase
      .from("trades")
      .select("*, markets(question, probability, status)")
      .eq("user_id", profile.id)
      .eq("is_rolled_back", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("trades")
      .select("market_id, type, amount")
      .eq("user_id", profile.id)
      .eq("is_rolled_back", false),
  ]);

  const balance = profile.balance ?? 0;
  const positions = (positionsResult.data ?? []) as PositionWithMarket[];
  const trades = (tradesResult.data ?? []) as TradeWithMarket[];
  const allTrades = (allTradesResult.data ?? []) as { market_id: string; type: "BUY" | "SELL"; amount: number }[];

  // Calculate portfolio value and P/L
  const positionsValue = positions.reduce((sum, pos) => {
    if (pos.markets.status === "active") {
      return (
        sum +
        pos.yes_shares * pos.markets.probability +
        pos.no_shares * (1 - pos.markets.probability)
      );
    }
    return sum;
  }, 0);

  // Calculate net investment per market from trade history (BUY = spent, SELL = received)
  const netInvestmentByMarket = new Map<string, number>();
  for (const trade of allTrades) {
    const current = netInvestmentByMarket.get(trade.market_id) ?? 0;
    if (trade.type === "BUY") {
      netInvestmentByMarket.set(trade.market_id, current + trade.amount);
    } else {
      netInvestmentByMarket.set(trade.market_id, current - trade.amount);
    }
  }

  // Calculate total invested only for active positions
  const totalInvested = positions.reduce((sum, pos) => {
    if (pos.markets.status === "active") {
      return sum + (netInvestmentByMarket.get(pos.market_id) ?? 0);
    }
    return sum;
  }, 0);

  const totalPnL = positionsValue - totalInvested;
  const totalValue = balance + positionsValue;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">{profile.username}</h1>
        <p className="text-sm text-muted">
          Portfolio positions and trade history.
        </p>
      </div>

      {/* Portfolio summary */}
      <div className="border-t border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="py-4 px-2">
            <p className="text-xs text-muted mb-1">Total Value</p>
            <p className="text-2xl font-bold text-accent">
              {formatLeaves(totalValue)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
          <div className="py-4 px-4">
            <p className="text-xs text-muted mb-1">Bal</p>
            <p className="text-2xl font-bold text-foreground">
              {formatLeaves(balance)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
          <div className="py-4 px-4">
            <p className="text-xs text-muted mb-1">Pos</p>
            <p className="text-2xl font-bold text-foreground">
              {formatLeaves(positionsValue)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
          <div className="py-4 px-4">
            <p className="text-xs text-muted mb-1">Total P/L</p>
            <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-yes' : 'text-no'}`}>
              {totalPnL >= 0 ? '+' : ''}{formatLeaves(totalPnL)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <PortfolioTabs
          positions={positions}
          trades={trades}
          netInvestmentByMarket={netInvestmentByMarket}
        />
      </div>
    </div>
  );
}
