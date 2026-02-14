"use client";

import { useRef, useState, useEffect } from "react";
import MarketCarouselCard from "@/components/market-carousel-card";
import type { Market } from "@/lib/types";

export interface ProbabilityPoint {
  probability: number;
  created_at: string;
}

interface MarketWithHistory {
  market: Market;
  history: ProbabilityPoint[];
}

interface HomeCarouselProps {
  marketsWithHistory: MarketWithHistory[];
}

export default function HomeCarousel({ marketsWithHistory }: HomeCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const count = marketsWithHistory?.length ?? 0;

  useEffect(() => {
    if (index < 0 || index >= count) return;
    const el = slideRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    }
  }, [index, count]);

  useEffect(() => {
    slideRefs.current = slideRefs.current.slice(0, count);
  }, [count]);

  if (!marketsWithHistory || marketsWithHistory.length === 0) {
    return (
      <div className="border-b border-border py-8 text-center">
        <p className="text-sm text-muted">No active markets yet.</p>
      </div>
    );
  }

  function goPrev() {
    setIndex((i) => (i <= 0 ? count - 1 : i - 1));
  }

  function goNext() {
    setIndex((i) => (i >= count - 1 ? 0 : i + 1));
  }

  return (
    <div className="flex flex-col min-h-0 w-full h-full max-h-full">
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory min-h-0 min-w-0 w-full scrollbar-hide max-h-[140px]"
      >
        {marketsWithHistory.map(({ market, history }, i) => (
          <div
            key={market.id}
            ref={(el) => { slideRefs.current[i] = el; }}
            className="shrink-0 snap-start flex min-h-0 w-full flex-[0_0_100%]"
            style={{ minWidth: "100%" }}
          >
            <div className="flex-1 min-w-0 min-h-0 flex w-full">
              <MarketCarouselCard market={market} history={history} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 py-4 shrink-0">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous market"
          className="p-2 text-muted hover:text-foreground transition-colors rounded border border-border hover:bg-card-hover"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5">
          {marketsWithHistory.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to market ${i + 1}`}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === index
                  ? "bg-accent"
                  : "bg-border hover:bg-muted"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={goNext}
          aria-label="Next market"
          className="p-2 text-muted hover:text-foreground transition-colors rounded border border-border hover:bg-card-hover"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
