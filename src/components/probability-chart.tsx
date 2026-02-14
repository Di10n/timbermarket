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
}

export default function ProbabilityChart({ data }: ProbabilityChartProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((point) => ({
    time: new Date(point.created_at).getTime(),
    probability: Math.round(point.probability * 100),
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm text-muted mb-3">Probability</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(val) =>
              new Date(val).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            }
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(val) => `${val}%`}
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(val) => new Date(val).toLocaleString()}
            formatter={(value) => [`${value}%`, "Probability"]}
          />
          <Area
            type="stepAfter"
            dataKey="probability"
            stroke="#10b981"
            fill="url(#probGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
