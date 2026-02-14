"use client";

import { useState } from "react";
import MarketCard from "@/components/market-card";
import type { Market } from "@/lib/types";

const PAGE_SIZE = 5;

export default function PaginatedMarketList({ markets }: { markets: Market[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(markets.length / PAGE_SIZE);
  const visible = markets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {visible.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 px-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-xs text-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            Previous
          </button>
          <span className="text-xs text-muted tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="text-xs text-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
