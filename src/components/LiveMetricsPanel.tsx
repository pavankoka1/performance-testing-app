"use client";

import type { LiveMetrics } from "@/lib/playwrightUtils";
import { Cpu, Gauge, LayoutGrid, MemoryStick } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const formatNum = (n: number | null) =>
  n != null ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : "—";

export default function LiveMetricsPanel({
  isRecording,
}: {
  isRecording: boolean;
}) {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRecording) {
      setMetrics(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch("/api/record?metrics=1");
        const data = await res.json();
        if (data.recording) setMetrics(data as LiveMetrics);
      } catch {
        setMetrics(null);
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRecording]);

  if (!isRecording || !metrics) return null;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-[#0d1f0d]/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90">
          Live metrics
        </span>
        <span className="text-xs text-white/50">
          {formatNum(metrics.elapsedSec)}s
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <Gauge className="h-4 w-4 text-amber-400/90" />
          <div>
            <p className="text-[10px] uppercase text-white/50">FPS</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              {formatNum(metrics.fps)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <Cpu className="h-4 w-4 text-cyan-400/90" />
          <div>
            <p className="text-[10px] uppercase text-white/50">CPU (2s)</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              {formatNum(metrics.cpuBusyMs)} ms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <MemoryStick className="h-4 w-4 text-violet-400/90" />
          <div>
            <p className="text-[10px] uppercase text-white/50">JS Heap</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              {formatNum(metrics.jsHeapMb)} MB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <LayoutGrid className="h-4 w-4 text-rose-400/90" />
          <div>
            <p className="text-[10px] uppercase text-white/50">DOM nodes</p>
            <p className="text-sm font-semibold text-white tabular-nums">
              {formatNum(metrics.domNodes)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
