"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface ProbabilityPoint {
  probability: number;
  created_at: string;
}

interface ProbabilityChartProps {
  data: ProbabilityPoint[];
  resolvedAt?: string | null;
}

export default function ProbabilityChart({ data, resolvedAt }: ProbabilityChartProps) {
  if (!data || data.length === 0) return null;

  const rawData = data.map((point) => ({
    time: new Date(point.created_at).getTime(),
    probability: Math.round(point.probability * 100),
  }));

  const endTime = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const last = rawData[rawData.length - 1];
  if (last && last.time < endTime) {
    rawData.push({ time: endTime, probability: last.probability });
  }

  // Interpolate points between data points so the cursor moves continuously
  // instead of snapping to peaks. Since the chart is stepAfter, probability
  // stays constant between changes.
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

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm text-muted mb-3">Probability</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-yes)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-yes)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", endTime]}
            tickFormatter={(val) =>
              new Date(val).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(val) => `${val}%`}
            stroke="var(--color-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
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
            fill="url(#probGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
