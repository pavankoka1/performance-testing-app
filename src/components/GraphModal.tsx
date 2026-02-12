"use client";

import type { MetricPoint, PerfReport } from "@/lib/reportTypes";
import { getClosestFrameAtTime, getVitalsAtTime } from "@/lib/reportUtils";
import { Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SessionTimeline from "./SessionTimeline";

type GraphModalProps = {
  title: string;
  unit: string;
  data: MetricPoint[];
  report: PerfReport;
  onClose: () => void;
};

const formatValue = (v: number) =>
  v > 1000 ? Math.round(v) : Math.round(v * 100) / 100;

export default function GraphModal({
  title,
  unit,
  data,
  report,
  onClose,
}: GraphModalProps) {
  const durationSec = report.durationMs / 1000;
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    playRef.current = setInterval(() => {
      setCurrentTimeSec((t) => {
        if (t >= durationSec - 0.5) {
          setPlaying(false);
          if (playRef.current) clearInterval(playRef.current);
          return durationSec;
        }
        return Math.min(durationSec, t + 0.5);
      });
    }, 100);
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [playing, durationSec]);

  const chartData = data.map((p) => ({
    timeSec: p.timeSec,
    value: formatValue(p.value),
  }));

  const handleChartClick = useCallback(
    (state: unknown) => {
      const s = state as {
        activePayload?: Array<{ payload?: { timeSec: number } }>;
      };
      const payload = s?.activePayload?.[0]?.payload;
      if (payload != null && typeof payload.timeSec === "number") {
        setCurrentTimeSec(Math.max(0, Math.min(durationSec, payload.timeSec)));
      }
    },
    [durationSec]
  );

  const vitals = getVitalsAtTime(report, currentTimeSec);
  const closestFrame = getClosestFrameAtTime(report, currentTimeSec);
  const isEmpty = !chartData.length || chartData.every((d) => d.value === 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Graph: ${title}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-lg font-semibold text-[var(--fg)]">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Square className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="mb-4 h-64 w-full">
            {isEmpty ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--fg-muted)]">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                  onClick={handleChartClick}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="timeSec"
                    type="number"
                    domain={[0, durationSec]}
                    tickFormatter={(t: number) => `${Math.round(t)}s`}
                    stroke="var(--fg-muted)"
                  />
                  <YAxis
                    stroke="var(--fg-muted)"
                    unit={unit}
                    domain={unit === "fps" ? [0, 120] : undefined}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                    }}
                    formatter={(value: number | undefined) => [
                      value ?? 0,
                      unit,
                    ]}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.timeSec != null
                        ? `Time: ${Number(payload[0].payload.timeSec).toFixed(
                            1
                          )}s`
                        : String(label)
                    }
                  />
                  <ReferenceLine
                    x={currentTimeSec}
                    stroke="var(--accent)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    fill="var(--accent)"
                    fillOpacity={0.2}
                    stroke="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mb-3 text-xs text-[var(--fg-muted)]">
            Click a point on the graph to jump to that time. Timeline below
            scrubs the session.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--fg-muted)]">
                Vitals at {currentTimeSec.toFixed(1)}s
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-[var(--fg-muted)]">FPS</span>
                <span className="font-mono text-[var(--fg)]">
                  {vitals.fps != null ? vitals.fps : "—"}
                </span>
                <span className="text-[var(--fg-muted)]">CPU (ms)</span>
                <span className="font-mono text-[var(--fg)]">
                  {vitals.cpuBusyMs != null ? vitals.cpuBusyMs : "—"}
                </span>
                <span className="text-[var(--fg-muted)]">GPU (ms)</span>
                <span className="font-mono text-[var(--fg)]">
                  {vitals.gpuBusyMs != null ? vitals.gpuBusyMs : "—"}
                </span>
                <span className="text-[var(--fg-muted)]">Heap (MB)</span>
                <span className="font-mono text-[var(--fg)]">
                  {vitals.jsHeapMb != null ? vitals.jsHeapMb : "—"}
                </span>
                <span className="text-[var(--fg-muted)]">DOM nodes</span>
                <span className="font-mono text-[var(--fg)]">
                  {vitals.domNodes != null ? vitals.domNodes : "—"}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase text-[var(--fg-muted)]">
                Closest frame
              </h4>
              {closestFrame ? (
                <div className="flex gap-2">
                  <img
                    src={closestFrame.imageDataUrl}
                    alt={`Frame at ${closestFrame.timeSec.toFixed(1)}s`}
                    className="h-20 w-28 rounded border border-[var(--border)] object-cover"
                  />
                  <div className="text-xs text-[var(--fg-muted)]">
                    <p className="font-medium text-[var(--fg)]">
                      {closestFrame.timeSec.toFixed(1)}s
                    </p>
                    <p>{Math.round(closestFrame.fps)} FPS</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--fg-muted)]">
                  No captured frame near this time.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3">
          <SessionTimeline
            durationSec={durationSec}
            currentTimeSec={currentTimeSec}
            onTimeChange={(t) => {
              setCurrentTimeSec(t);
              setPlaying(false);
            }}
            showLabels={true}
          />
        </div>
      </div>
    </div>
  );
}
