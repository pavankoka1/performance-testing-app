export type MetricPoint = {
  timeSec: number;
  value: number;
};

export type MetricSeries = {
  label: string;
  unit: string;
  points: MetricPoint[];
};

export type BottleneckSuggestion = {
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
};

export type NetworkRequest = {
  url: string;
  method: string;
  status?: number;
  type?: string;
  transferSize?: number;
  durationMs?: number;
};

export type PerfReport = {
  startedAt: string;
  stoppedAt: string;
  durationMs: number;
  fpsSeries: MetricSeries;
  cpuSeries: MetricSeries;
  gpuSeries: MetricSeries;
  memorySeries: MetricSeries;
  domNodesSeries: MetricSeries;
  layoutMetrics: {
    layoutCount: number;
    paintCount: number;
    layoutTimeMs: number;
    paintTimeMs: number;
  };
  longTasks: {
    count: number;
    totalTimeMs: number;
    topTasks: Array<{
      name: string;
      durationMs: number;
      startSec: number;
    }>;
  };
  networkSummary: {
    requests: number;
    totalBytes: number;
    averageLatencyMs: number;
  };
  networkRequests: NetworkRequest[];
  renderBreakdown: {
    scriptMs: number;
    layoutMs: number;
    rasterMs: number;
    compositeMs: number;
  };
  webglMetrics: {
    drawCalls: number;
    shaderCompiles: number;
    otherEvents: number;
  };
  suggestions: BottleneckSuggestion[];
};
