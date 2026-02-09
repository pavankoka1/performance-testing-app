"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import type { MetricPoint } from "@/lib/reportTypes";

type MetricChartProps = {
  title: string;
  unit: string;
  data: MetricPoint[];
  type?: "line" | "bar";
  labelFormatter?: (point: MetricPoint) => string;
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
}: MetricChartProps) {
  const chartData = data.map((point) => ({
    time: labelFormatter
      ? labelFormatter(point)
      : `${Math.round(point.timeSec)}s`,
    value: formatValue(point.value),
  }));

  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-[#121212]/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-white/60">{unit}</span>
      </div>
      <div className="h-48 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          {type === "bar" ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip contentStyle={{ background: "#1E1E1E", border: "none" }} />
              <Bar dataKey="value" fill="#8A2BE2" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip contentStyle={{ background: "#1E1E1E", border: "none" }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8A2BE2"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
