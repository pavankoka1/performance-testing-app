"use client";

import type { PerfReport } from "@/lib/reportTypes";
import { getVitalsAtTime } from "@/lib/reportUtils";
import { Activity, Cpu, LayoutGrid, MemoryStick, X } from "lucide-react";
import { useEffect } from "react";
import SessionTimeline from "./SessionTimeline";

type SpikeFrameModalProps = {
  report: PerfReport;
  frame: PerfReport["spikeFrames"][0];
  currentTimeSec: number;
  onTimeChange: (timeSec: number) => void;
  onClose: () => void;
};

const formatNum = (n: number | null) =>
  n != null ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : "—";

export default function SpikeFrameModal({
  report,
  frame,
  currentTimeSec,
  onTimeChange,
  onClose,
}: SpikeFrameModalProps) {
  const durationSec = report.durationMs / 1000;
  const vitals = getVitalsAtTime(report, frame.timeSec);

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
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Spike frame detail"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-lg font-semibold text-[var(--fg)]">
            Frame at {frame.timeSec.toFixed(1)}s · {Math.round(frame.fps)} FPS
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:flex-row">
          <div className="flex-shrink-0 md:w-2/3">
            <img
              src={frame.imageDataUrl}
              alt={`Frame at ${frame.timeSec.toFixed(1)}s`}
              className="max-h-[50vh] w-full rounded-lg border border-[var(--border)] object-contain"
            />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4 md:w-1/3">
            <h4 className="text-sm font-semibold text-[var(--fg)]">
              Vitals at this time
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[var(--fg-muted)]">FPS</span>
                <span className="font-mono text-[var(--fg)]">
                  {formatNum(vitals.fps)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[var(--fg-muted)]">CPU</span>
                <span className="font-mono text-[var(--fg)]">
                  {formatNum(vitals.cpuBusyMs)} ms
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[var(--fg-muted)]">GPU</span>
                <span className="font-mono text-[var(--fg)]">
                  {formatNum(vitals.gpuBusyMs)} ms
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MemoryStick className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[var(--fg-muted)]">Heap</span>
                <span className="font-mono text-[var(--fg)]">
                  {formatNum(vitals.jsHeapMb)} MB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-[var(--fg-muted)]">DOM</span>
                <span className="font-mono text-[var(--fg)]">
                  {formatNum(vitals.domNodes)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3">
          <SessionTimeline
            durationSec={durationSec}
            currentTimeSec={currentTimeSec}
            onTimeChange={onTimeChange}
            showLabels={true}
          />
        </div>
      </div>
    </div>
  );
}
