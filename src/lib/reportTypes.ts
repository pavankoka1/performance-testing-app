export const humanizeAnimationName = (name: string): string => {
  if (!name || name === "(unnamed)") return "(unnamed)";
  const n = name.toLowerCase();
  if (n.startsWith("cc-"))
    return `Compositor: ${name.slice(3).replace(/-/g, " ")}`;
  if (n.startsWith("blink-"))
    return `Style: ${name.slice(6).replace(/-/g, " ")}`;
  if (n.includes("skeleton")) return `Skeleton loader (${name})`;
  if (n.includes("shimmer")) return `Shimmer effect (${name})`;
  if (n.includes("fade")) return `Fade (${name})`;
  if (n.includes("pulse")) return `Pulse (${name})`;
  return name;
};

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
  animationMetrics: {
    animations: Array<{
      id: string;
      name: string;
      type: "CSSTransition" | "CSSAnimation" | "WebAnimation";
      startTimeSec?: number;
      durationMs?: number;
      delayMs?: number;
      properties?: string[];
      bottleneckHint?: "compositor" | "paint" | "layout";
    }>;
    animationFrameEventsPerSec: MetricSeries;
    totalAnimations: number;
  };
  webVitals: {
    fcpMs?: number;
    lcpMs?: number;
    cls?: number;
    tbtMs: number;
    longTaskCount: number;
    longTaskTotalMs: number;
  };
  spikeFrames: Array<{
    timeSec: number;
    fps: number;
    imageDataUrl: string;
  }>;
  video: {
    url: string;
    format: "webm";
  } | null;
  suggestions: BottleneckSuggestion[];
  /** Developer hints for layout thrashing, re-renders, etc. */
  developerHints?: {
    layoutThrashing?: {
      detected: boolean;
      burstCount: number;
      worstBurstAtSec: number;
      layoutsInWorstBurst: number;
      windowMs: number;
    };
    reactRerenders?: {
      totalEvents: number;
      durationSec: number;
      components: Array<{
        name: string;
        renderCount: number;
        triggeredBy?: string;
        inBursts: number;
        source?: string;
      }>;
      topRerenderers: Array<{
        name: string;
        count: number;
        triggeredBy?: string;
        parentHierarchy?: string;
        inBursts: number;
      }>;
      /** Time-bucketed data for chart: Y=count, X=time */
      chartData: Array<{
        timeSec: number;
        value: number;
        components: Array<{ name: string; count: number; hierarchy?: string }>;
      }>;
      /** Events with estimated time for timeline */
      timeline: Array<{
        index: number;
        timeSec: number;
        componentName: string;
        triggeredBy?: string;
        parentHierarchy?: string;
        op?: string;
        inBurst: boolean;
      }>;
      /** Burst windows: [startIndex, endIndex, count] */
      bursts: Array<{
        startIndex: number;
        endIndex: number;
        count: number;
        startTimeSec: number;
        endTimeSec: number;
        topComponents: Array<{ name: string; count: number }>;
      }>;
    };
  };
};
