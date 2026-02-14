"use client";

import Link from "next/link";
import { timeAgo, formatLeaves } from "@/lib/utils";
import type { Market } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface ProbabilityPoint {
  probability: number;
  created_at: string;
}

interface MarketCarouselCardProps {
  market: Market;
  history?: ProbabilityPoint[];
}

export default function MarketCarouselCard({ market, history }: MarketCarouselCardProps) {
  const prob = market.probability;
  const yesPercent = Math.round(prob * 100);
  const noPercent = Math.round((1 - prob) * 100);

  // Prepare chart data
  const rawData = (history || []).map((point) => ({
    time: new Date(point.created_at).getTime(),
    probability: Math.round(point.probability * 100),
  }));

  const endTime = Date.now();
  const last = rawData[rawData.length - 1];
  if (last && last.time < endTime) {
    rawData.push({ time: endTime, probability: last.probability });
  }

  // Check if same day for X-axis formatting
  const firstDate = new Date(rawData[0]?.time || Date.now());
  const lastDate = new Date(endTime);
  const isSameDay =
    firstDate.getFullYear() === lastDate.getFullYear() &&
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getDate() === lastDate.getDate();
  const timeSpan = endTime - (rawData[0]?.time || Date.now());
  const isShortSpan = timeSpan < 24 * 60 * 60 * 1000;

  // Interpolate points for smooth cursor movement (matches market page chart)
  const chartData: { time: number; probability: number }[] = [];
  const TARGET_POINTS = 200;
  if (rawData.length >= 2) {
    const totalSpan = rawData[rawData.length - 1].time - rawData[0].time;
    const step = totalSpan / TARGET_POINTS;
    for (let i = 0; i < rawData.length - 1; i++) {
      const curr = rawData[i];
      const next = rawData[i + 1];
      chartData.push(curr);
      if (step > 0) {
        let t = curr.time + step;
        while (t < next.time) {
          chartData.push({ time: t, probability: curr.probability });
          t += step;
        }
      }
    }
    chartData.push(rawData[rawData.length - 1]);
  } else {
    chartData.push(...rawData);
  }

  // Unique gradient ID per market to avoid SVG conflicts
  const gradientId = `probGradient-carousel-${market.id}`;

  return (
    <Link href={`/markets/${market.id}`} className="block h-full w-full">
      <div className="bg-card border border-border rounded-lg p-6 hover:border-accent/30 hover:shadow-md transition-all h-full w-full flex flex-col">
        {/* Header with question */}
        <h3 className="text-foreground font-bold text-xl leading-snug mb-4">
          {market.question}
        </h3>

        {/* YES/NO percentages */}
        <div className="flex gap-8 mb-4">
          <div>
            <div className="text-4xl font-bold text-yes">{yesPercent}%</div>
            <div className="text-sm text-muted">Yes</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-no">{noPercent}%</div>
            <div className="text-sm text-muted">No</div>
          </div>
        </div>

        {/* Probability chart */}
        <div className="flex-1 bg-muted/20 border border-border rounded-lg p-4 min-h-0">
          <h4 className="text-sm text-muted mb-3">Probability</h4>
          {rawData.length > 0 ? (
            <div style={{ width: '100%', height: '320px', minHeight: '320px', paddingBottom: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 15 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-yes)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", endTime]}
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    if (isSameDay || isShortSpan) {
                      return date.toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      });
                    } else {
                      return date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                    }
                  }}
                  stroke="var(--color-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  height={50}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(val) => `${val}%`}
                  stroke="var(--color-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  padding={{ top: 0, bottom: 0 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-foreground)",
                  }}
                  labelFormatter={(val) => new Date(val).toLocaleString()}
                  formatter={(value) => [`${value}%`, "Probability"]}
                />
                <Area
                  type="stepAfter"
                  dataKey="probability"
                  stroke="var(--color-yes)"
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              No history data
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 mt-4 text-xs text-muted">
          <span className="font-medium">{formatLeaves(market.volume)} Vol.</span>
          <span>•</span>
          <span>{timeAgo(market.created_at)}</span>
          {market.status === "resolved" && (
            <span className="px-2 py-1 bg-accent/10 text-accent rounded">
              {market.resolution}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
