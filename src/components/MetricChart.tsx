"use client";

import type { MetricPoint } from "@/lib/reportTypes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricChartProps = {
  title: string;
  unit: string;
  data: MetricPoint[];
  type?: "line" | "bar";
  labelFormatter?: (point: MetricPoint) => string;
  durationSec?: number;
  onOpenModal?: () => void;
  /** Y-axis domain for line charts, e.g. [0, 120] for FPS */
  yDomain?: [number, number];
};

const formatValue = (value: number) => {
  if (value > 1000) {
    return Math.round(value);
  }
  return Math.round(value * 100) / 100;
};

export default function MetricChart({
  title,
  unit,
  data,
  type = "line",
  labelFormatter,
  durationSec,
  onOpenModal,
  yDomain,
}: MetricChartProps) {
  const chartData = data.map((point, i) => ({
    id: i,
    time: labelFormatter
      ? labelFormatter(point)
      : `${Math.round(point.timeSec)}s`,
    timeSec: point.timeSec,
    value: formatValue(point.value),
  }));

  const isEmpty = !chartData.length || chartData.every((d) => d.value === 0);

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--fg)]">{title}</h3>
        <div className="flex items-center gap-2">
          {onOpenModal && (
            <button
              type="button"
              onClick={onOpenModal}
              className="text-xs text-[var(--accent)] hover:underline"
            >
              Open in modal
            </button>
          )}
          <span className="text-xs text-[var(--fg-muted)]">{unit}</span>
        </div>
      </div>
      <div
        className="h-48 w-full min-w-0 cursor-pointer"
        onClick={onOpenModal ?? undefined}
        onKeyDown={(e) => onOpenModal && e.key === "Enter" && onOpenModal()}
        role={onOpenModal ? "button" : undefined}
        tabIndex={onOpenModal ? 0 : undefined}
      >
        {isEmpty ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--fg-muted)]">
            No data in this session
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            {type === "bar" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" stroke="var(--fg-muted)" />
                <YAxis stroke="var(--fg-muted)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="var(--accent)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey={durationSec != null ? "timeSec" : "time"}
                  type={durationSec != null ? "number" : "category"}
                  domain={durationSec != null ? [0, durationSec] : undefined}
                  tickFormatter={
                    durationSec != null
                      ? (t: number) => `${Math.round(t)}s`
                      : undefined
                  }
                  stroke="var(--fg-muted)"
                />
                <YAxis stroke="var(--fg-muted)" domain={yDomain} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
