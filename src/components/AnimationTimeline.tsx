"use client";

import { humanizeAnimationName, type PerfReport } from "@/lib/reportTypes";

type AnimationTimelineProps = {
  animations: NonNullable<PerfReport["animationMetrics"]>["animations"];
  durationSec: number;
  formatNumber: (value: number) => string;
};

const BOTTLENECK_COLORS = {
  compositor: "var(--compositor, #10b981)",
  paint: "var(--paint, #f59e0b)",
  layout: "var(--layout, #ef4444)",
} as const;

const DEFAULT_BAR_MS = 500;

export default function AnimationTimeline({
  animations,
  durationSec,
  formatNumber,
}: AnimationTimelineProps) {
  const effectiveDuration = Math.max(durationSec, 1);

  const bars = animations
    .map((anim, i) => {
      const start = anim.startTimeSec ?? i * 0.3;
      const durationSecBar =
        anim.durationMs != null
          ? anim.durationMs / 1000
          : DEFAULT_BAR_MS / 1000;
      const leftPct = Math.max(
        0,
        Math.min(99, (start / effectiveDuration) * 100)
      );
      const widthPct = Math.min(
        Math.max(0, 100 - leftPct),
        (durationSecBar / effectiveDuration) * 100
      );
      return {
        ...anim,
        leftPct,
        widthPct: Math.max(widthPct, 1.5),
        durationSecBar,
      };
    })
    .filter((b) => b.widthPct > 0.5);

  if (bars.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--fg-muted)]">
        No animations captured. Record a page with CSS/Web Animations to see the
        timeline.
      </div>
    );
  }

  const ticks: number[] = [];
  const step = Math.max(1, Math.floor(effectiveDuration / 8));
  for (let t = 0; t < effectiveDuration; t += step) {
    ticks.push(t);
  }
  const lastTick = ticks[ticks.length - 1];
  if (lastTick === undefined || Math.abs(lastTick - effectiveDuration) > 0.1) {
    ticks.push(effectiveDuration);
  }

  return (
    <div className="w-full">
      <div className="relative overflow-x-auto">
        <div className="min-w-[400px]" style={{ width: "100%" }}>
          {/* Time ruler */}
          <div
            className="relative mb-2 h-5 border-b border-[var(--border)]"
            style={{ minHeight: 20 }}
          >
            {ticks.map((t, i) => (
              <span
                key={`tick-${i}-${t}`}
                className="absolute -translate-x-1/2 text-[10px] text-[var(--fg-muted)]"
                style={{
                  left: `${(t / effectiveDuration) * 100}%`,
                }}
              >
                {Math.round(t)}s
              </span>
            ))}
          </div>

          {/* Animation bars */}
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {bars.map((bar, i) => (
              <div
                key={`anim-${i}-${bar.id}`}
                className="group relative flex h-8 items-center"
                title={`${humanizeAnimationName(bar.name)} • ${bar.type} • ${
                  bar.properties?.join(", ") ?? "—"
                } • ${formatNumber(bar.durationSecBar * 1000)}ms`}
              >
                <div
                  className="absolute left-0 top-1/2 h-5 w-24 -translate-y-1/2 truncate pr-1 text-right text-xs text-[var(--fg-muted)]"
                  style={{ minWidth: 96 }}
                >
                  <span
                    className="truncate"
                    title={
                      bar.name
                        ? humanizeAnimationName(bar.name)
                        : bar.properties?.length
                        ? bar.properties.join(", ")
                        : "(unnamed)"
                    }
                  >
                    {bar.name
                      ? humanizeAnimationName(bar.name)
                      : bar.properties?.length
                      ? bar.properties.join(", ")
                      : "(unnamed)"}
                  </span>
                  {bar.bottleneckHint && (
                    <span
                      className="ml-1 inline-block rounded px-1 text-[10px]"
                      style={{
                        backgroundColor:
                          bar.bottleneckHint === "compositor"
                            ? "rgba(16,185,129,0.2)"
                            : bar.bottleneckHint === "paint"
                            ? "rgba(245,158,11,0.2)"
                            : "rgba(239,68,68,0.2)",
                        color:
                          bar.bottleneckHint === "compositor"
                            ? "#10b981"
                            : bar.bottleneckHint === "paint"
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {bar.bottleneckHint}
                    </span>
                  )}
                </div>
                <div
                  className="relative ml-24 flex-1 overflow-hidden rounded"
                  style={{ height: 20 }}
                >
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded opacity-90 transition-opacity group-hover:opacity-100"
                    style={{
                      left: `${bar.leftPct}%`,
                      width: `${bar.widthPct}%`,
                      minWidth: 4,
                      backgroundColor: bar.bottleneckHint
                        ? BOTTLENECK_COLORS[bar.bottleneckHint]
                        : "#64748b",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--fg-muted)]">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3 rounded"
            style={{ backgroundColor: BOTTLENECK_COLORS.compositor }}
          />
          compositor (transform/opacity)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3 rounded"
            style={{ backgroundColor: BOTTLENECK_COLORS.paint }}
          />
          paint (color, shadow)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3 rounded"
            style={{ backgroundColor: BOTTLENECK_COLORS.layout }}
          />
          layout (width, margin)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded bg-slate-500" />
          unknown
        </span>
      </div>
    </div>
  );
}
