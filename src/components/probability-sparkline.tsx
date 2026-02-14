"use client";

import { useId } from "react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export interface ProbabilityPoint {
  probability: number;
  created_at: string;
}

interface ProbabilitySparklineProps {
  data: ProbabilityPoint[];
  /** Shorter height for wide cards */
  compact?: boolean;
}

export default function ProbabilitySparkline({ data, compact = false }: ProbabilitySparklineProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `sparkline-gradient-${id}`;

  if (!data || data.length === 0) return null;

  const rawData = data.map((point) => ({
    time: new Date(point.created_at).getTime(),
    probability: Math.round(point.probability * 100),
  }));

  // Pad left with 50% so the trendline is wide enough (starts at 50% of chart)
  const padCount = rawData.length;
  const firstPoint = rawData[0];
  const minTime = firstPoint?.time ?? 0;
  const padding = Array.from({ length: padCount }, (_, i) => ({
    time: minTime - (padCount - i) * 60000,
    probability: firstPoint?.probability ?? 50,
  }));
  const chartData = [...padding, ...rawData];

  return (
    <div className={`w-full ${compact ? "h-10 mt-0 flex-1 min-h-[40px]" : "h-14 mt-3"}`} style={compact ? { minHeight: 40 } : { minHeight: 56 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-yes)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "11px",
              padding: "4px 8px",
              color: "var(--color-foreground)",
            }}
            labelFormatter={(val) =>
              new Date(val).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            }
            formatter={(value) => [`${value}%`, "Probability"]}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke="var(--color-yes)"
            fill={`url(#${gradientId})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
