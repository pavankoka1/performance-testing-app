"use client";

import type { PerfReport } from "@/lib/reportTypes";
import { AlertTriangle, ArrowRight, Layers, Zap } from "lucide-react";
import ReRendersChart from "./ReRendersChart";

type ReactRerendersData = NonNullable<
  NonNullable<PerfReport["developerHints"]>["reactRerenders"]
>;

type ReactRerendersSectionProps = {
  data: ReactRerendersData;
  durationSec: number;
  formatNumber: (value: number) => string;
};

export default function ReactRerendersSection({
  data,
  durationSec,
  formatNumber,
}: ReactRerendersSectionProps) {
  const eventsPerSec =
    (data.durationSec ?? 0) > 0
      ? data.totalEvents / (data.durationSec ?? 1)
      : 0;
  const burstCount = data.bursts?.length ?? 0;
  const hasBursts = burstCount > 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Total events
          </p>
          <p className="text-lg font-semibold text-[var(--fg)]">
            {data.totalEvents}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Components
          </p>
          <p className="text-lg font-semibold text-[var(--fg)]">
            {data.components.length}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Events/sec
          </p>
          <p className="text-lg font-semibold text-[var(--fg)]">
            {formatNumber(eventsPerSec)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Burst windows
          </p>
          <p
            className={`text-lg font-semibold ${
              hasBursts ? "text-amber-400" : "text-[var(--fg)]"
            }`}
          >
            {burstCount}
          </p>
        </div>
      </div>

      {/* Re-renders chart */}
      {(data.chartData?.length ?? 0) > 0 && (
        <ReRendersChart
          chartData={data.chartData}
          durationSec={durationSec}
          formatNumber={formatNumber}
        />
      )}

      {/* Burst warning */}
      {hasBursts && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-400">
              {burstCount} re-render burst{burstCount !== 1 ? "s" : ""} detected
            </p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              Many components re-rendered in quick succession. Check for shared
              state updates, context changes, or parent re-renders cascading
              down.
            </p>
          </div>
        </div>
      )}

      {/* Timeline visualization */}
      {(data.timeline?.length ?? 0) > 0 && durationSec > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
            <Zap className="h-4 w-4 text-[var(--accent)]" />
            Re-renders over session
          </p>
          <div className="relative h-16 w-full overflow-hidden rounded-lg bg-[var(--bg)]">
            {data.timeline.map((ev, i) => {
              const leftPct = (ev.timeSec / durationSec) * 100;
              const width = Math.max(1, (1 / data.timeline.length) * 100 * 2);
              return (
                <div
                  key={`timeline-${i}`}
                  className="absolute top-0 h-full"
                  style={{
                    left: `${leftPct}%`,
                    width: `${width}%`,
                    minWidth: 2,
                    backgroundColor: ev.inBurst
                      ? "rgba(245, 158, 11, 0.7)"
                      : "rgba(139, 92, 246, 0.4)",
                  }}
                  title={`${ev.componentName}${
                    ev.triggeredBy ? ` ← ${ev.triggeredBy}` : ""
                  } @ ${formatNumber(ev.timeSec)}s${
                    ev.inBurst ? " (burst)" : ""
                  }`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-[var(--fg-muted)]">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded"
                style={{ backgroundColor: "rgba(139, 92, 246, 0.6)" }}
              />
              Single render
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded"
                style={{ backgroundColor: "rgba(245, 158, 11, 0.7)" }}
              />
              Burst (5+ in quick succession)
            </span>
          </div>
        </div>
      )}

      {/* Burst details */}
      {(data.bursts?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 text-sm font-medium text-[var(--fg)]">
            Burst windows — when & what
          </p>
          <div className="space-y-3">
            {(data.bursts ?? []).slice(0, 8).map((burst, i) => (
              <div
                key={`burst-${i}`}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-amber-400">
                    {formatNumber(burst.startTimeSec)}s —{" "}
                    {formatNumber(burst.endTimeSec)}s
                  </span>
                  <span className="text-[var(--fg-muted)]">
                    ({burst.count} renders)
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[var(--fg-muted)]">
                  Top:{" "}
                  {burst.topComponents
                    .map((c) => `${c.name} (${c.count})`)
                    .join(", ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Component table with triggers */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
          <Layers className="h-4 w-4 text-[var(--accent)]" />
          Components by re-render count
        </p>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium text-[var(--fg-muted)]">
                  Component
                </th>
                <th className="py-2 pr-3 font-medium text-[var(--fg-muted)]">
                  Count
                </th>
                <th className="py-2 pr-3 font-medium text-[var(--fg-muted)]">
                  Triggered by
                </th>
                <th className="py-2 pr-3 font-medium text-[var(--fg-muted)]">
                  Parent hierarchy
                </th>
                <th className="py-2 font-medium text-[var(--fg-muted)]">
                  In bursts
                </th>
              </tr>
            </thead>
            <tbody>
              {(data.topRerenderers ?? []).map((c, i) => (
                <tr
                  key={`${c.name}-${i}`}
                  className="border-b border-[var(--border)]/50"
                >
                  <td className="py-2 pr-3">
                    <code className="rounded bg-[var(--bg)] px-1.5 py-0.5 font-mono text-[11px]">
                      {c.name}
                    </code>
                  </td>
                  <td className="py-2 pr-3 font-medium">{c.count}</td>
                  <td className="py-2 pr-3">
                    {c.triggeredBy ? (
                      <span className="flex items-center gap-1 text-[var(--fg-muted)]">
                        <ArrowRight className="h-3 w-3 rotate-180" />
                        {c.triggeredBy}
                      </span>
                    ) : (
                      <span className="text-[var(--fg-muted)]/60">—</span>
                    )}
                  </td>
                  <td
                    className="max-w-40 truncate py-2 pr-3"
                    title={c.parentHierarchy}
                  >
                    {c.parentHierarchy ? (
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        {c.parentHierarchy}
                      </span>
                    ) : (
                      <span className="text-[var(--fg-muted)]/60">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {c.inBursts > 0 ? (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-400">
                        {c.inBursts}
                      </span>
                    ) : (
                      <span className="text-[var(--fg-muted)]/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
