import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatLeaves } from "@/lib/utils";
import PortfolioTabs from "@/components/portfolio-tabs";
import type { PositionWithMarket, TradeWithMarket } from "@/lib/types";
import LeafIcon from "@/components/leaf-icon";

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Portfolio</h1>
        <p className="text-sm text-muted">
          Your positions, trade history, and balance overview.
        </p>
      </div>

      {/* Portfolio summary */}
      <div className="border-t border-border">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="py-4 px-2">
            <p className="text-xs text-muted mb-1">Total Value</p>
            <p className="text-2xl font-bold text-accent">
              {formatLeaves(totalValue)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
          <div className="py-4 px-4">
            <p className="text-xs text-muted mb-1">Balance</p>
            <p className="text-2xl font-bold text-foreground">
              {formatLeaves(balance)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
          <div className="py-4 px-4">
            <p className="text-xs text-muted mb-1">In Positions</p>
            <p className="text-2xl font-bold text-foreground">
              {formatLeaves(positionsValue)} <span className="text-sm font-normal text-muted"><LeafIcon /></span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <PortfolioTabs positions={positions} trades={trades} />
      </div>
    </div>
  );
}
