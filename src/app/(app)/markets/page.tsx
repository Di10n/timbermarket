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
    <div>
      <h1 className="text-xl font-bold mb-6 border-b border-border pb-4">Markets</h1>

      {(!activeMarkets || activeMarkets.length === 0) && (
        <p className="text-muted text-sm py-4">No active markets yet.</p>
      )}

      <div className="space-y-2">
        {activeMarkets?.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {resolvedMarkets && resolvedMarkets.length > 0 && (
        <div className="mt-12 border-t border-border pt-8">
          <h2 className="text-lg font-bold mb-4 text-muted border-b border-border pb-3">Resolved</h2>
          <div className="space-y-2 opacity-70">
            {resolvedMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
