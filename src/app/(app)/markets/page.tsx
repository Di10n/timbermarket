import { createClient } from "@/lib/supabase/server";
import MarketCard from "@/components/market-card";
import type { Market } from "@/lib/types";

export default async function MarketsPage() {
  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  const activeMarkets = (markets as Market[] | null)?.filter(
    (m) => m.status === "active"
  );
  const resolvedMarkets = (markets as Market[] | null)?.filter(
    (m) => m.status === "resolved"
  );

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Markets</h1>

      {(!activeMarkets || activeMarkets.length === 0) && (
        <p className="text-muted text-sm py-4">No active markets yet.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeMarkets?.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {resolvedMarkets && resolvedMarkets.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-6 text-muted">Resolved Markets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-70">
            {resolvedMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
