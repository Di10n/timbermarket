import Link from "next/link";
import MarketCard from "@/components/market-card";
import type { Market } from "@/lib/types";

export default function PaginatedMarketList({ markets }: { markets: Market[] }) {
  const visible = markets.slice(0, 5);

  return (
    <div>
      {visible.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
      {markets.length > 5 && (
        <div className="pt-4 px-2 text-center">
          <Link
            href="/"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            More markets
          </Link>
        </div>
      )}
    </div>
  );
}
