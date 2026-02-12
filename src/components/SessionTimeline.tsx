"use client";

import { useCallback } from "react";

type SessionTimelineProps = {
  durationSec: number;
  currentTimeSec: number;
  onTimeChange: (timeSec: number) => void;
  className?: string;
  showLabels?: boolean;
};

export default function SessionTimeline({
  durationSec,
  currentTimeSec,
  onTimeChange,
  className = "",
  showLabels = true,
}: SessionTimelineProps) {
  const clamped = Math.max(0, Math.min(durationSec, currentTimeSec));
  const percent = durationSec > 0 ? (clamped / durationSec) * 100 : 0;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const p = rect.width > 0 ? x / rect.width : 0;
      const t = Math.max(0, Math.min(durationSec, p * durationSec));
      onTimeChange(t);
    },
    [durationSec, onTimeChange]
  );

  return (
    <div className={className}>
      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={durationSec}
        aria-valuenow={clamped}
        tabIndex={0}
        className="relative h-8 w-full cursor-pointer rounded-lg bg-[var(--bg-elevated)]"
        onClick={handleClick}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 5 : 1;
          if (e.key === "ArrowLeft") onTimeChange(Math.max(0, clamped - step));
          if (e.key === "ArrowRight")
            onTimeChange(Math.min(durationSec, clamped + step));
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-l-lg bg-[var(--accent)]/40 transition-[width]"
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-[var(--accent)] bg-[var(--fg)] shadow-md"
          style={{ left: `calc(${percent}% - 8px)` }}
        />
      </div>
      {showLabels && (
        <div className="mt-1 flex justify-between text-xs text-[var(--fg-muted)]">
          <span>0s</span>
          <span>{clamped.toFixed(1)}s</span>
          <span>{durationSec.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}
