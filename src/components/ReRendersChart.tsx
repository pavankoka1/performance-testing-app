"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartPoint = {
  timeSec: number;
  value: number;
  components: Array<{ name: string; count: number; hierarchy?: string }>;
};

type ReRendersChartProps = {
  chartData: ChartPoint[];
  durationSec: number;
  formatNumber: (value: number) => string;
};

export default function ReRendersChart({
  chartData,
  durationSec,
  formatNumber,
}: ReRendersChartProps) {
  const mapped = chartData.map((p) => ({
    ...p,
    id: p.timeSec,
    time: `${formatNumber(p.timeSec)}s`,
  }));

  const isEmpty = !mapped.length || mapped.every((d) => d.value === 0);

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--fg)]">
          Re-renders over time
        </h3>
        <span className="text-xs text-[var(--fg-muted)]">count</span>
      </div>
      <div className="h-48 w-full min-w-0">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--fg-muted)]">
            No re-render data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            <AreaChart data={mapped} margin={{ right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="timeSec"
                type="number"
                domain={[0, durationSec]}
                tickFormatter={(t: number) => `${Math.round(t)}s`}
                stroke="var(--fg-muted)"
              />
              <YAxis stroke="var(--fg-muted)" allowDecimals={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload as ChartPoint;
                  return (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg">
                      <p className="mb-2 text-xs font-medium text-[var(--fg)]">
                        {formatNumber(p.timeSec)}s — {p.value} re-render
                        {p.value !== 1 ? "s" : ""}
                      </p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
                        {p.components.map((c, i) => (
                          <li
                            key={`${c.name}-${i}`}
                            className="flex flex-col gap-0.5"
                          >
                            <span className="font-mono text-[var(--fg)]">
                              {c.name}
                              {c.count > 1 ? ` (${c.count})` : ""}
                            </span>
                            {c.hierarchy && (
                              <span className="text-[var(--fg-muted)]">
                                ← {c.hierarchy}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }}
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="var(--accent)"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
