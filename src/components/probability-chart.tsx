"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from "recharts";

const OUTCOME_COLORS = [
  "rgb(59, 130, 246)", // blue
  "rgb(34, 197, 94)", // green
  "rgb(168, 85, 247)", // purple
  "rgb(251, 146, 60)", // orange
  "rgb(239, 68, 68)", // red
  "rgb(236, 72, 153)", // pink
  "rgb(6, 182, 212)", // cyan
  "rgb(250, 204, 21)", // yellow
  "rgb(99, 102, 241)", // indigo
  "rgb(20, 184, 166)", // teal
];

interface ProbabilityPoint {
  probability?: number;
  probability_distribution?: Record<string, number>;
  created_at: string;
}

interface ProbabilityChartProps {
  data: ProbabilityPoint[];
  resolvedAt?: string | null;
}

export default function ProbabilityChart({ data, resolvedAt }: ProbabilityChartProps) {
  if (!data || data.length === 0) return null;

  // Determine if this is a binary or multi-resolution market
  const isBinary = data[0]?.probability !== undefined && data[0]?.probability !== null;

  const endTime = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();

  if (isBinary) {
    // Binary market chart (existing logic)
    const rawData = data.map((point) => ({
      time: new Date(point.created_at).getTime(),
      probability: Math.round((point.probability || 0) * 100),
    }));

    const last = rawData[rawData.length - 1];
    if (last && last.time < endTime) {
      rawData.push({ time: endTime, probability: last.probability });
    }

    // Check if all data is from the same day
    const firstDate = new Date(rawData[0]?.time || Date.now());
    const lastDate = new Date(endTime);
    const isSameDay =
      firstDate.getFullYear() === lastDate.getFullYear() &&
      firstDate.getMonth() === lastDate.getMonth() &&
      firstDate.getDate() === lastDate.getDate();

    // Check if span is less than 24 hours
    const timeSpan = endTime - (rawData[0]?.time || Date.now());
    const isShortSpan = timeSpan < 24 * 60 * 60 * 1000;

    // Interpolate points
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
        <div style={{ width: '100%', height: '320px', minHeight: '320px', paddingBottom: '10px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -5, bottom: 15 }}>
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
                type="monotone"
                dataKey="probability"
                stroke="var(--color-yes)"
                fill="url(#probGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Multi-resolution market chart
  // Extract all outcomes from the first point
  const firstDist = data[0]?.probability_distribution || {};
  const outcomes = Object.keys(firstDist);

  // Transform data for multi-line chart
  const rawData = data.map((point) => {
    const chartPoint: Record<string, number | string> = {
      time: new Date(point.created_at).getTime(),
    };
    const dist = point.probability_distribution || {};
    outcomes.forEach((outcome) => {
      chartPoint[outcome] = Math.round((dist[outcome] || 0) * 100);
    });
    return chartPoint;
  });

  // Extend to current time
  const last = rawData[rawData.length - 1];
  if (last && (last.time as number) < endTime) {
    const extendedPoint: Record<string, number | string> = { time: endTime };
    outcomes.forEach((outcome) => {
      extendedPoint[outcome] = last[outcome] as number;
    });
    rawData.push(extendedPoint);
  }

  // Check if all data is from the same day
  const firstDate = new Date((rawData[0]?.time as number) || Date.now());
  const lastDate = new Date(endTime);
  const isSameDay =
    firstDate.getFullYear() === lastDate.getFullYear() &&
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getDate() === lastDate.getDate();

  // Check if span is less than 24 hours
  const timeSpan = endTime - ((rawData[0]?.time as number) || Date.now());
  const isShortSpan = timeSpan < 24 * 60 * 60 * 1000;

  // Interpolate points
  const chartData: Array<Record<string, number | string>> = [];
  const TARGET_POINTS = 200;
  if (rawData.length >= 2) {
    const totalSpan = (rawData[rawData.length - 1].time as number) - (rawData[0].time as number);
    const step = totalSpan / TARGET_POINTS;
    for (let i = 0; i < rawData.length - 1; i++) {
      const curr = rawData[i];
      const next = rawData[i + 1];
      chartData.push(curr);
      if (step > 0) {
        let t = (curr.time as number) + step;
        while (t < (next.time as number)) {
          const interpolatedPoint: Record<string, number | string> = { time: t };
          outcomes.forEach((outcome) => {
            interpolatedPoint[outcome] = curr[outcome] as number;
          });
          chartData.push(interpolatedPoint);
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
      <div style={{ width: '100%', height: '320px', minHeight: '320px', paddingBottom: '10px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: -5, bottom: 15 }}>
            <defs>
              {outcomes.map((outcome, idx) => (
                <linearGradient key={`gradient-${outcome}`} id={`gradient-${outcome}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={OUTCOME_COLORS[idx % OUTCOME_COLORS.length]} stopOpacity={0.1} />
                  <stop offset="95%" stopColor={OUTCOME_COLORS[idx % OUTCOME_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
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
              stroke="var(--color-border)"
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
              formatter={(value, name) => [`${value}%`, name]}
            />
            <Legend
              wrapperStyle={{
                fontSize: "12px",
                paddingTop: "10px",
              }}
            />
            {outcomes.map((outcome, idx) => (
              <Line
                key={outcome}
                type="monotone"
                dataKey={outcome}
                stroke={OUTCOME_COLORS[idx % OUTCOME_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                name={outcome}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
