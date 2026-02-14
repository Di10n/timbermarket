import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PortfolioTabs from "@/components/portfolio-tabs";
import type { PositionWithMarket, TradeWithMarket } from "@/lib/types";

export default async function PortfolioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileResult, positionsResult, tradesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single(),
    supabase
      .from("positions")
      .select("*, markets(question, probability, status, resolution)")
      .eq("user_id", user.id),
    supabase
      .from("trades")
      .select("*, markets(question, probability, status)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const balance = (profileResult.data as { balance: number } | null)?.balance ?? 0;
  const positions = (positionsResult.data ?? []) as PositionWithMarket[];
  const trades = (tradesResult.data ?? []) as TradeWithMarket[];

  // Calculate portfolio value
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

  const totalValue = balance + positionsValue;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Portfolio</h1>

      {/* Portfolio summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted mb-1">Total Value</p>
          <p className="text-2xl font-bold text-accent">
            {Math.round(totalValue).toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted mb-1">Balance</p>
          <p className="text-2xl font-bold">
            {Math.round(balance).toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted mb-1">In Positions</p>
          <p className="text-2xl font-bold">
            {Math.round(positionsValue).toLocaleString()}
          </p>
        </div>
      </div>

      <PortfolioTabs positions={positions} trades={trades} />
    </div>
  );
}
