import type { MetricPoint, PerfReport } from "./reportTypes";

export function getVitalsAtTime(
  report: PerfReport,
  timeSec: number
): {
  fps: number | null;
  cpuBusyMs: number | null;
  gpuBusyMs: number | null;
  jsHeapMb: number | null;
  domNodes: number | null;
} {
  const pick = (points: MetricPoint[]): number | null => {
    if (!points.length) return null;
    const sorted = [...points].sort((a, b) => a.timeSec - b.timeSec);
    let best = sorted[0];
    let bestDiff = Math.abs(best.timeSec - timeSec);
    for (const p of sorted) {
      const d = Math.abs(p.timeSec - timeSec);
      if (d < bestDiff) {
        bestDiff = d;
        best = p;
      }
    }
    return best.value;
  };
  return {
    fps: pick(report.fpsSeries.points),
    cpuBusyMs: pick(report.cpuSeries.points),
    gpuBusyMs: pick(report.gpuSeries.points),
    jsHeapMb: pick(report.memorySeries.points),
    domNodes: pick(report.domNodesSeries.points),
  };
}

export function getClosestFrameAtTime(
  report: PerfReport,
  timeSec: number
): PerfReport["spikeFrames"][0] | null {
  if (!report.spikeFrames.length) return null;
  const sorted = [...report.spikeFrames].sort(
    (a, b) => Math.abs(a.timeSec - timeSec) - Math.abs(b.timeSec - timeSec)
  );
  return sorted[0];
}
