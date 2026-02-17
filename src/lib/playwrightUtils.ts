import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Request,
} from "playwright";
import yauzl from "yauzl";
import type { MetricPoint, PerfReport } from "./reportTypes";

type TraceEvent = {
  name?: string;
  cat?: string;
  ph?: string;
  ts?: number;
  dur?: number;
  args?: Record<string, unknown>;
};

type TraceSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  traceCdp: CDPSession;
  metricsCdp: CDPSession;
  tracePath: string;
  startedAt: number;
  samples: PerfSample[];
  fpsSamples: MetricPoint[];
  screenshots: Array<{ timeSec: number; path: string }>;
  screenshotInterval?: NodeJS.Timeout;
  viewportLockInterval?: NodeJS.Timeout;
  networkRequests: PerfReport["networkRequests"];
  requestIds: WeakMap<Request, string>;
  pendingRequests: Map<
    string,
    { url: string; method: string; startAt: number }
  >;
  sampleInterval?: NodeJS.Timeout;
  viewportSize: { width: number; height: number };
  cpuThrottle: number;
  collectedAnimations: CollectedAnimation[];
};

let activeSession: TraceSession | null = null;
let lastVideoPath: string | null = null;

const FRAME_EVENT_NAMES = new Set([
  "DrawFrame",
  "BeginFrame",
  "SwapBuffers",
  "CompositeLayers",
]);

const SCRIPT_EVENT_NAMES = new Set([
  "EvaluateScript",
  "V8.Execute",
  "CompileScript",
  "V8.Compile",
  "FunctionCall",
]);

const RASTER_EVENT_NAMES = new Set(["Rasterize", "RasterTask", "GPUTask"]);

const COMPOSITE_EVENT_NAMES = new Set(["CompositeLayers", "UpdateLayerTree"]);

const LAYOUT_EVENT_NAMES = new Set(["Layout", "UpdateLayoutTree"]);

const PAINT_EVENT_NAMES = new Set(["Paint", "PaintImage"]);

const ANIMATION_FRAME_EVENT_NAMES = new Set([
  "AnimationFrame",
  "FireAnimationFrame",
  "RequestAnimationFrame",
  "Animation Frame Fired",
  "DrawFrame",
  "BeginFrame",
  "SwapBuffers",
  "CompositeLayers",
]);

const WEBGL_EVENT_HINTS = ["WebGL", "glDraw", "GL.Draw", "DrawElements"];

const LAYOUT_TRIGGERING_PROPS = new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  "margin",
  "padding",
  "border",
  "font-size",
  "display",
  "position",
]);

const PAINT_TRIGGERING_PROPS = new Set([
  "color",
  "background",
  "box-shadow",
  "outline",
  "filter",
  "border-radius",
]);

function inferBottleneck(
  properties?: string[],
  animationName?: string
): "compositor" | "paint" | "layout" | undefined {
  if (properties?.length) {
    const lower = properties.map((p) => p.toLowerCase());
    if (
      lower.some(
        (p) =>
          LAYOUT_TRIGGERING_PROPS.has(p) ||
          p.includes("margin") ||
          p.includes("padding")
      )
    )
      return "layout";
    if (
      lower.some(
        (p) =>
          PAINT_TRIGGERING_PROPS.has(p) ||
          p.includes("shadow") ||
          p.includes("background")
      )
    )
      return "paint";
    if (lower.some((p) => p === "transform" || p === "opacity"))
      return "compositor";
  }
  const name = (animationName ?? "").toLowerCase();
  if (name.startsWith("cc-")) return "compositor";
  if (name.startsWith("blink-") || name.includes("style")) return "layout";
  if (
    name.includes("fade") ||
    name.includes("opacity") ||
    name.includes("transform")
  )
    return "compositor";
  if (
    name.includes("skeleton") ||
    name.includes("shimmer") ||
    name.includes("pulse")
  )
    return "compositor";
  return undefined;
}

type CollectedAnimation = {
  id: string;
  name: string;
  type: "CSSTransition" | "CSSAnimation" | "WebAnimation";
  startTimeSec?: number;
  durationMs?: number;
  delayMs?: number;
  properties?: string[];
};

type PerfTotals = {
  taskDuration: number;
  scriptDuration: number;
  layoutDuration: number;
  jsHeapSize: number;
  nodes: number;
};

type PerfSample = {
  timeSec: number;
  cpuBusyMs: number;
  scriptMs: number;
  layoutMs: number;
  jsHeapMb?: number;
  nodes?: number;
};

type ClientCollector = {
  longTasks: Array<{ start: number; duration: number }>;
  cls: number;
  fcp?: number;
  lcp?: number;
};

const ensureValidUrl = (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid URL including http:// or https://");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }
  return parsed.toString();
};

const getLaunchOptions = async () => {
  const isServerless = Boolean(process.env.VERCEL);
  const headless = process.env.PERFTRACE_HEADLESS === "true" || isServerless;

  if (isServerless && headless) {
    const Chromium = (await import("@sparticuz/chromium")).default;
    return {
      headless: true,
      executablePath: await Chromium.executablePath(),
      args: Chromium.args,
      defaultViewport: { width: 1366, height: 768 },
    };
  }

  return {
    headless,
    args: [
      "--disable-dev-shm-usage",
      "--window-size=1366,768",
      "--window-position=0,0",
    ],
  };
};

export const startRecording = async (
  url: string,
  cpuThrottle: 1 | 4 | 6 = 1
) => {
  if (activeSession) {
    throw new Error("A recording session is already running.");
  }

  const safeUrl = ensureValidUrl(url);
  const launchOptions = await getLaunchOptions();
  const videoDir = path.join(os.tmpdir(), "perftrace-videos");
  await fs.mkdir(videoDir, { recursive: true });
  if (lastVideoPath) {
    await fs.unlink(lastVideoPath).catch(() => undefined);
    lastVideoPath = null;
  }

  const viewportWidth = 1366;
  const viewportHeight = 768;
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
    recordVideo: {
      dir: videoDir,
      size: { width: viewportWidth, height: viewportHeight },
    },
  });
  const page = await context.newPage();
  const traceCdp = await context.newCDPSession(page);
  const metricsCdp = await context.newCDPSession(page);

  const tracePath = path.join(os.tmpdir(), `perftrace-${randomUUID()}.zip`);

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
    title: "PerfTrace Session",
  });

  await metricsCdp.send("Performance.enable");
  const collectedAnimations: CollectedAnimation[] = [];
  try {
    await metricsCdp.send("Animation.enable");
    metricsCdp.on(
      "Animation.animationStarted",
      (params: { animation: unknown }) => {
        const a = (params as { animation: Record<string, unknown> }).animation;
        if (!a || typeof a.id !== "string") return;
        const source = a.source as Record<string, unknown> | undefined;
        const keyframesRule = source?.keyframesRule as
          | {
              keyframes?: Array<Record<string, unknown>>;
            }
          | undefined;
        const keyframeList = keyframesRule?.keyframes ?? [];
        const properties: string[] = [];
        for (const kf of keyframeList) {
          const style = kf.style as Record<string, string> | undefined;
          if (style && typeof style === "object") {
            for (const key of Object.keys(style)) {
              if (
                key !== "offset" &&
                key !== "easing" &&
                !properties.includes(key)
              )
                properties.push(key);
            }
          }
        }
        const duration =
          typeof source?.duration === "number" ? source.duration : undefined;
        const delay =
          typeof source?.delay === "number" ? source.delay : undefined;
        collectedAnimations.push({
          id: a.id,
          name: (a.name as string) ?? "",
          type:
            (a.type as "CSSTransition" | "CSSAnimation" | "WebAnimation") ??
            "WebAnimation",
          startTimeSec: (Date.now() - recordingStartMs) / 1000,
          durationMs: duration != null ? duration : undefined,
          delayMs: delay != null ? delay : undefined,
          properties: properties.length ? properties : undefined,
        });
      }
    );
  } catch {
    // Animation domain is experimental and may not be available
  }
  if (cpuThrottle > 1) {
    try {
      await metricsCdp.send("Emulation.setCPUThrottlingRate", {
        rate: cpuThrottle,
      });
    } catch {
      // Emulation.setCPUThrottlingRate may not be available in all environments.
    }
  }
  await traceCdp.send("Tracing.start", {
    categories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "disabled-by-default-devtools.timeline.paint",
      "disabled-by-default-devtools.timeline.layers",
      "disabled-by-default-devtools.timeline.stack",
      "blink.user_timing",
      "v8",
      "gpu",
    ].join(","),
    transferMode: "ReturnAsStream",
  });

  await ensureClientCollectors(page);
  await ensureMemoryAndDomCollector(page);

  const recordingStartMs = Date.now();
  await page.goto(safeUrl, { waitUntil: "domcontentloaded" });
  await ensureFpsCollector(page);
  const updateActivePage = async (newPage: Page) => {
    await ensureClientCollectors(newPage);
    await ensureMemoryAndDomCollector(newPage);
    await ensureFpsCollector(newPage);
    const newMetrics = await context.newCDPSession(newPage);
    await newMetrics.send("Performance.enable");
    try {
      await newMetrics.send("Animation.enable");
      newMetrics.on(
        "Animation.animationStarted",
        (params: { animation: unknown }) => {
          const a = (params as { animation: Record<string, unknown> })
            .animation;
          if (!a || typeof a.id !== "string") return;
          const source = a.source as Record<string, unknown> | undefined;
          const keyframesRule = source?.keyframesRule as
            | {
                keyframes?: Array<Record<string, unknown>>;
              }
            | undefined;
          const keyframeList = keyframesRule?.keyframes ?? [];
          const properties: string[] = [];
          for (const kf of keyframeList) {
            const style = kf.style as Record<string, string> | undefined;
            if (style && typeof style === "object") {
              for (const key of Object.keys(style)) {
                if (
                  key !== "offset" &&
                  key !== "easing" &&
                  !properties.includes(key)
                )
                  properties.push(key);
              }
            }
          }
          const duration =
            typeof source?.duration === "number" ? source.duration : undefined;
          const delay =
            typeof source?.delay === "number" ? source.delay : undefined;
          collectedAnimations.push({
            id: a.id,
            name: (a.name as string) ?? "",
            type:
              (a.type as "CSSTransition" | "CSSAnimation" | "WebAnimation") ??
              "WebAnimation",
            startTimeSec: (Date.now() - recordingStartMs) / 1000,
            durationMs: duration != null ? duration : undefined,
            delayMs: delay != null ? delay : undefined,
            properties: properties.length ? properties : undefined,
          });
        }
      );
    } catch {
      // Animation domain may not be available
    }
    if (cpuThrottle > 1) {
      try {
        await newMetrics.send("Emulation.setCPUThrottlingRate", {
          rate: cpuThrottle,
        });
      } catch {
        // ignore
      }
    }
    activeSession = activeSession
      ? { ...activeSession, page: newPage, metricsCdp: newMetrics }
      : activeSession;
  };

  context.on("page", (newPage) => {
    updateActivePage(newPage).catch(() => undefined);
  });

  const samples: PerfSample[] = [];
  const fpsSamples: MetricPoint[] = [];
  const screenshots: Array<{ timeSec: number; path: string }> = [];
  const networkRequests: PerfReport["networkRequests"] = [];
  const requestIds = new WeakMap<Request, string>();
  const pendingRequests = new Map<
    string,
    { url: string; method: string; startAt: number }
  >();
  let lastPerfTotals: PerfTotals | undefined;

  const onRequest = (request: Request) => {
    const id = randomUUID();
    requestIds.set(request, id);
    pendingRequests.set(id, {
      url: request.url(),
      method: request.method(),
      startAt: Date.now(),
    });
  };

  const onRequestEnd = async (request: Request) => {
    const id = requestIds.get(request);
    if (!id) return;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pendingRequests.delete(id);
    const response = await request.response();
    const endAt = Date.now();
    networkRequests.push({
      url: pending.url,
      method: pending.method,
      status: response?.status(),
      type: request.resourceType(),
      durationMs: endAt - pending.startAt,
      transferSize: response?.headers()["content-length"]
        ? Number(response?.headers()["content-length"])
        : undefined,
    });
  };

  context.on("request", onRequest);
  context.on("requestfinished", onRequestEnd);
  context.on("requestfailed", onRequestEnd);

  const sampleInterval = setInterval(async () => {
    try {
      const metrics = await (activeSession?.metricsCdp ?? metricsCdp).send(
        "Performance.getMetrics"
      );
      const metricMap = new Map(
        metrics.metrics.map((metric) => [metric.name, metric.value])
      );
      let jsHeapSize =
        metricMap.get("JSHeapUsedSize") ?? metricMap.get("JSHeapSize") ?? 0;
      let nodes = metricMap.get("Nodes") ?? metricMap.get("DOMNodeCount") ?? 0;

      const activePage = activeSession?.page ?? page;
      try {
        const client = (await activePage.evaluate(() => {
          const w = window as Window & {
            __perftraceMemory?: { heapMb: number; nodes: number };
          };
          return w.__perftraceMemory ?? null;
        })) as { heapMb: number; nodes: number } | null;
        if (client) {
          if (client.heapMb > 0) jsHeapSize = client.heapMb * 1024 * 1024;
          if (client.nodes > 0) nodes = client.nodes;
        }
      } catch {
        // Use CDP values only.
      }

      const totals: PerfTotals = {
        taskDuration: metricMap.get("TaskDuration") ?? 0,
        scriptDuration: metricMap.get("ScriptDuration") ?? 0,
        layoutDuration: metricMap.get("LayoutDuration") ?? 0,
        jsHeapSize,
        nodes,
      };

      const lastTotals = lastPerfTotals;
      const deltaTask = lastTotals
        ? Math.max(0, (totals.taskDuration - lastTotals.taskDuration) * 1000)
        : 0;
      const deltaScript = lastTotals
        ? Math.max(
            0,
            (totals.scriptDuration - lastTotals.scriptDuration) * 1000
          )
        : 0;
      const deltaLayout = lastTotals
        ? Math.max(
            0,
            (totals.layoutDuration - lastTotals.layoutDuration) * 1000
          )
        : 0;

      samples.push({
        timeSec: Math.max(0, (Date.now() - recordingStartMs) / 1000),
        cpuBusyMs: deltaTask,
        scriptMs: deltaScript,
        layoutMs: deltaLayout,
        jsHeapMb: totals.jsHeapSize
          ? totals.jsHeapSize / (1024 * 1024)
          : undefined,
        nodes: totals.nodes ? totals.nodes : undefined,
      });

      lastPerfTotals = totals;
    } catch {
      // Ignore sampling errors to avoid breaking the session.
    }
  }, 2000);

  const screenshotInterval = setInterval(async () => {
    try {
      if (screenshots.length >= 12) {
        return;
      }
      const shotPath = path.join(
        os.tmpdir(),
        `perftrace-shot-${randomUUID()}.jpg`
      );
      const activePage = activeSession?.page ?? page;
      await activePage.screenshot({
        path: shotPath,
        type: "jpeg",
        quality: 60,
      });
      screenshots.push({
        timeSec: Math.max(0, (Date.now() - recordingStartMs) / 1000),
        path: shotPath,
      });
    } catch {
      // Ignore screenshot failures to avoid breaking the session.
    }
  }, 3000);

  const viewportLockInterval = setInterval(() => {
    const session = activeSession;
    if (!session) return;
    const targetPage = session.page;
    targetPage
      .setViewportSize({
        width: viewportWidth,
        height: viewportHeight,
      })
      .catch(() => undefined);
  }, 2000);

  activeSession = {
    browser,
    context,
    page,
    traceCdp,
    metricsCdp,
    tracePath,
    startedAt: recordingStartMs,
    samples,
    fpsSamples,
    screenshots,
    screenshotInterval,
    viewportLockInterval,
    networkRequests,
    requestIds,
    pendingRequests,
    sampleInterval,
    viewportSize: { width: viewportWidth, height: viewportHeight },
    cpuThrottle,
    collectedAnimations,
  };

  return {
    status: "recording",
    url: safeUrl,
  };
};

export const stopRecording = async (): Promise<PerfReport> => {
  const stopRequestedAt = Date.now();
  if (!activeSession) {
    throw new Error("No active session to stop.");
  }

  const {
    browser,
    context,
    tracePath,
    startedAt,
    page,
    traceCdp,
    samples,
    fpsSamples,
    screenshots,
    screenshotInterval,
    viewportLockInterval,
    networkRequests,
    sampleInterval,
    collectedAnimations = [],
  } = activeSession;
  activeSession = null;

  if (sampleInterval) {
    clearInterval(sampleInterval);
  }
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
  }
  if (viewportLockInterval) {
    clearInterval(viewportLockInterval);
  }

  try {
    const pageFps = (await page.evaluate(() => {
      const state = (
        window as Window & { __perftrace?: { samples?: MetricPoint[] } }
      ).__perftrace;
      return state?.samples ?? [];
    })) as MetricPoint[];
    fpsSamples.push(...pageFps);
  } catch {
    // Ignore FPS sampling failures.
  }

  const clientCollector = await readClientCollectorSnapshot(page);
  let traceText = "";
  const pages = context.pages();
  const pageVideo = page.video();
  try {
    await context.tracing.stop({ path: tracePath });
    const streamHandle = await endCdpTrace(traceCdp);
    traceText = await readTraceStream(traceCdp, streamHandle);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const stoppedAt = stopRequestedAt;
  const wallClockMs = stopRequestedAt - startedAt;
  const shouldLog =
    typeof process !== "undefined" &&
    (process.env?.NODE_ENV !== "production" ||
      process.env?.PERFTRACE_DEBUG === "1");
  if (shouldLog) {
    console.log("[PerfTrace] stopRecording.fallbackInput", {
      wallClockMs,
      wallClockSec: wallClockMs / 1000,
      samplesCount: samples.length,
      samplesTimeSecRange:
        samples.length > 0
          ? [
              Math.min(...samples.map((s) => s.timeSec)),
              Math.max(...samples.map((s) => s.timeSec)),
            ]
          : null,
      fpsSamplesCount: fpsSamples.length,
      fpsSamplesTimeSecRange:
        fpsSamples.length > 0
          ? [
              Math.min(...fpsSamples.map((s) => s.timeSec)),
              Math.max(...fpsSamples.map((s) => s.timeSec)),
            ]
          : null,
    });
  }
  lastVideoPath = await selectBestVideoPath(pages, pageVideo);
  let report: PerfReport;
  try {
    report = await parseTrace(tracePath, traceText, startedAt, stoppedAt, {
      samples,
      fpsSamples,
      networkRequests,
      collectedAnimations,
    });
  } catch (err) {
    if (shouldLog) {
      console.warn("[PerfTrace] parseTrace failed, using fallback report", err);
    }
    report = buildFallbackReport(startedAt, stoppedAt, {
      samples,
      fpsSamples,
      networkRequests,
      collectedAnimations,
    });
  }

  report.spikeFrames = await buildSpikeFrames(report, screenshots);
  report.webVitals = deriveWebVitals(clientCollector, report.longTasks);
  if (report.webVitals.cls && report.webVitals.cls > 0.1) {
    report.suggestions.push({
      title: "Layout shifts detected",
      detail:
        "CLS is above 0.1. Stabilize layout and reserve space for async content.",
      severity: "warning",
    });
  }
  if (report.webVitals.tbtMs > 300) {
    report.suggestions.push({
      title: "High total blocking time",
      detail: "TBT is elevated. Reduce long tasks and heavy main-thread work.",
      severity: "warning",
    });
  }
  report.video = lastVideoPath
    ? { url: "/api/record?video=1", format: "webm" }
    : null;
  normalizeReportTimeRange(report);
  if (shouldLog) {
    const summary: Record<string, unknown> = {
      durationMs: report.durationMs,
      durationSec: report.durationMs / 1000,
    };
    for (const key of [
      "fpsSeries",
      "cpuSeries",
      "gpuSeries",
      "memorySeries",
      "domNodesSeries",
    ] as const) {
      const series = report[key];
      if (series?.points?.length) {
        const pts = series.points;
        summary[key] = {
          pointCount: pts.length,
          timeSecRange: [
            Math.min(...pts.map((p) => p.timeSec)),
            Math.max(...pts.map((p) => p.timeSec)),
          ],
          valueRange: [
            Math.min(...pts.map((p) => p.value)),
            Math.max(...pts.map((p) => p.value)),
          ],
        };
      }
    }
    console.log("[PerfTrace] stopRecording.reportSummary", summary);
  }
  await cleanupScreenshots(screenshots);
  await fs.unlink(tracePath);
  return report;
};

function normalizeReportTimeRange(report: PerfReport): void {
  const durationSec = report.durationMs / 1000;
  const debugLog = (label: string, data: Record<string, unknown>) => {
    if (
      typeof process !== "undefined" &&
      (process.env?.NODE_ENV !== "production" ||
        process.env?.PERFTRACE_DEBUG === "1")
    ) {
      console.log(`[PerfTrace] ${label}`, data);
    }
  };
  const seriesKeys = [
    "fpsSeries",
    "cpuSeries",
    "gpuSeries",
    "memorySeries",
    "domNodesSeries",
  ] as const;
  for (const key of seriesKeys) {
    const series = report[key];
    if (!series?.points?.length) continue;
    const points = series.points;
    const maxTime = Math.max(...points.map((p) => p.timeSec));
    const mightBeMs = maxTime > durationSec * 1.5;
    const valueRange =
      points.length > 0
        ? [
            Math.min(...points.map((p) => p.value)),
            Math.max(...points.map((p) => p.value)),
          ]
        : null;
    debugLog("normalizeReportTimeRange.before", {
      key,
      durationSec,
      pointCount: points.length,
      timeSecRangeBefore: [
        Math.min(...points.map((p) => p.timeSec)),
        Math.max(...points.map((p) => p.timeSec)),
      ],
      valueRange,
      mightBeMs,
    });
    for (const p of series.points) {
      let t = p.timeSec;
      if (mightBeMs) t = t / 1000;
      p.timeSec = Math.max(0, Math.min(durationSec, t));
    }
    series.points.sort((a, b) => a.timeSec - b.timeSec);
    debugLog("normalizeReportTimeRange.after", {
      key,
      timeSecRangeAfter: [
        Math.min(...series.points.map((x) => x.timeSec)),
        Math.max(...series.points.map((x) => x.timeSec)),
      ],
    });
  }
  for (const frame of report.spikeFrames) {
    let t = frame.timeSec;
    if (t > durationSec * 1.5) t = t / 1000;
    frame.timeSec = Math.max(0, Math.min(durationSec, t));
  }

  extendSeriesToFullDuration(report);
}

function extendSeriesToFullDuration(report: PerfReport): void {
  const durationSec = report.durationMs / 1000;
  const seriesKeys = [
    "fpsSeries",
    "cpuSeries",
    "gpuSeries",
    "memorySeries",
    "domNodesSeries",
  ] as const;
  for (const key of seriesKeys) {
    const series = report[key];
    if (!series?.points?.length) continue;
    const points = series.points;
    const minTime = Math.min(...points.map((p) => p.timeSec));
    const maxTime = Math.max(...points.map((p) => p.timeSec));
    if (minTime > 0.5) {
      points.unshift({ timeSec: 0, value: points[0].value });
    }
    if (maxTime >= durationSec - 0.5) {
      points.sort((a, b) => a.timeSec - b.timeSec);
      continue;
    }
    const last = points[points.length - 1];
    if (!last) continue;
    const step = 2;
    let t = Math.min(maxTime + step, durationSec);
    while (t < durationSec - 0.5) {
      points.push({ timeSec: t, value: last.value });
      t += step;
    }
    points.push({ timeSec: durationSec, value: last.value });
    points.sort((a, b) => a.timeSec - b.timeSec);
  }
}

export const getLatestVideo = async () => {
  if (!lastVideoPath) {
    throw new Error("No video available.");
  }
  const data = await fs.readFile(lastVideoPath);
  return { data, contentType: "video/webm" };
};

export type LiveMetrics = {
  recording: true;
  elapsedSec: number;
  fps: number | null;
  cpuBusyMs: number | null;
  jsHeapMb: number | null;
  domNodes: number | null;
};

export const getLiveMetrics = async (): Promise<LiveMetrics | null> => {
  const session = activeSession;
  if (!session) return null;
  const elapsedSec = (Date.now() - session.startedAt) / 1000;
  const last = session.samples[session.samples.length - 1];
  let fps: number | null = null;
  try {
    const state = (await session.page.evaluate(() => {
      const w = window as Window & {
        __perftrace?: { frames: number; last: number; samples: MetricPoint[] };
      };
      const p = w.__perftrace;
      if (!p) return null;
      if (p.samples.length > 0) {
        return p.samples[p.samples.length - 1].value;
      }
      return p.frames;
    })) as number | null;
    fps = state != null ? state : null;
  } catch {
    // ignore
  }
  return {
    recording: true,
    elapsedSec,
    fps,
    cpuBusyMs: last ? last.cpuBusyMs : null,
    jsHeapMb: last?.jsHeapMb ?? null,
    domNodes: last?.nodes ?? null,
  };
};

const parseTrace = async (
  tracePath: string,
  traceText: string,
  startedAt: number,
  stoppedAt: number,
  fallback: {
    samples: PerfSample[];
    fpsSamples: MetricPoint[];
    networkRequests: PerfReport["networkRequests"];
    collectedAnimations?: CollectedAnimation[];
  }
): Promise<PerfReport> => {
  const tracePayload =
    traceText || (await readTraceFromZip(tracePath).catch(() => ""));
  const events = tracePayload ? parseTraceEvents(tracePayload) : [];

  let startTs = Number.POSITIVE_INFINITY;
  let endTs = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (typeof event.ts === "number") {
      if (event.ts < startTs) startTs = event.ts;
      if (event.ts > endTs) endTs = event.ts;
    }
  }
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    startTs = 0;
    endTs = 0;
  }
  const wallClockDurationMs = Math.max(0, stoppedAt - startedAt);
  const wallClockDurationSec = wallClockDurationMs / 1000;
  const rawTraceSpan = endTs - startTs;
  const traceTsIsMicroseconds = rawTraceSpan > 1e6;
  const traceDurationMs =
    startTs < endTs
      ? traceTsIsMicroseconds
        ? rawTraceSpan / 1000
        : rawTraceSpan
      : 0;
  const durationMs = wallClockDurationMs;
  const traceTsToSec = traceTsIsMicroseconds ? 1_000_000 : 1000;
  const traceSpanTooLarge =
    traceDurationMs > wallClockDurationMs * 10 && traceDurationMs > 60000;
  const useTraceForSeries =
    !traceSpanTooLarge &&
    traceDurationMs >= wallClockDurationMs * 0.8 &&
    traceDurationMs > 0;

  const debugLog = (label: string, data: Record<string, unknown>) => {
    if (
      typeof process !== "undefined" &&
      (process.env?.NODE_ENV !== "production" ||
        process.env?.PERFTRACE_DEBUG === "1")
    ) {
      console.log(`[PerfTrace] ${label}`, data);
    }
  };

  debugLog("parseTrace.start", {
    wallClockDurationMs,
    wallClockDurationSec,
    rawTraceSpan,
    traceTsIsMicroseconds,
    traceTsToSec,
    traceDurationMs,
    useTraceForSeries,
    eventCount: events.length,
    fallbackSamplesCount: fallback.samples.length,
    fallbackFpsCount: fallback.fpsSamples.length,
    fallbackSamplesTimeSecRange:
      fallback.samples.length > 0
        ? [
            Math.min(...fallback.samples.map((s) => s.timeSec)),
            Math.max(...fallback.samples.map((s) => s.timeSec)),
          ]
        : null,
    fallbackFpsTimeSecRange:
      fallback.fpsSamples.length > 0
        ? [
            Math.min(...fallback.fpsSamples.map((s) => s.timeSec)),
            Math.max(...fallback.fpsSamples.map((s) => s.timeSec)),
          ]
        : null,
  });

  const fpsMap = new Map<number, number>();
  const cpuBusyMap = new Map<number, number>();
  const gpuBusyMap = new Map<number, number>();
  const memoryPoints: MetricPoint[] = [];
  const domPoints: MetricPoint[] = [];

  let layoutCount = 0;
  let paintCount = 0;
  let layoutTimeMs = 0;
  let paintTimeMs = 0;

  const longTasks: Array<{
    name: string;
    durationMs: number;
    startSec: number;
  }> = [];

  const networkRequests = new Map<
    string,
    {
      url: string;
      method: string;
      startTs: number;
      status?: number;
      type?: string;
      transferSize?: number;
      endTs?: number;
    }
  >();

  let totalTransfer = 0;
  let totalNetworkLatency = 0;

  let scriptMs = 0;
  let layoutMs = 0;
  let rasterMs = 0;
  let compositeMs = 0;

  let webglDrawCalls = 0;
  let webglShaderCompiles = 0;
  let webglOtherEvents = 0;

  const animationFrameMap = new Map<number, number>();

  const tsToSec = (ts: number): number => {
    if (traceSpanTooLarge && rawTraceSpan > 0) {
      const ratio = (ts - startTs) / rawTraceSpan;
      return Math.max(
        0,
        Math.min(wallClockDurationSec, ratio * wallClockDurationSec)
      );
    }
    return Math.max(
      0,
      Math.min(wallClockDurationSec, (ts - startTs) / traceTsToSec)
    );
  };

  const addToBucket = (
    bucket: Map<number, number>,
    ts: number,
    value: number
  ) => {
    const second = Math.floor(tsToSec(ts));
    bucket.set(second, (bucket.get(second) ?? 0) + value);
  };

  for (const event of events) {
    const name = event.name ?? "";
    const cat = event.cat ?? "";
    const ts = event.ts ?? 0;
    const dur = event.dur ?? 0;

    if (FRAME_EVENT_NAMES.has(name)) {
      addToBucket(fpsMap, ts, 1);
    }

    if (event.ph === "X" && dur > 0) {
      const durMs = dur / 1000;
      if (cat.includes("toplevel") || name === "RunTask") {
        addToBucket(cpuBusyMap, ts, durMs);
      }
      if (cat.includes("gpu") || name.includes("GPU")) {
        addToBucket(gpuBusyMap, ts, durMs);
      }
    }

    if (LAYOUT_EVENT_NAMES.has(name)) {
      layoutCount += 1;
      layoutTimeMs += dur / 1000;
      layoutMs += dur / 1000;
    }

    if (PAINT_EVENT_NAMES.has(name)) {
      paintCount += 1;
      paintTimeMs += dur / 1000;
    }

    if (SCRIPT_EVENT_NAMES.has(name)) {
      scriptMs += dur / 1000;
    }

    if (RASTER_EVENT_NAMES.has(name)) {
      rasterMs += dur / 1000;
    }

    if (COMPOSITE_EVENT_NAMES.has(name)) {
      compositeMs += dur / 1000;
    }

    if (ANIMATION_FRAME_EVENT_NAMES.has(name)) {
      addToBucket(animationFrameMap, ts, 1);
    }

    if (name === "RunTask" && dur / 1000 > 50) {
      longTasks.push({
        name,
        durationMs: dur / 1000,
        startSec: tsToSec(ts),
      });
    }

    if (name === "UpdateCounters") {
      const data = (event.args?.data ?? {}) as Record<string, number>;
      const heap =
        data.jsHeapSizeUsed ?? data.jsHeapSize ?? data.usedJSHeapSize;
      const nodes = data.nodes ?? data.documentCount;
      if (typeof heap === "number") {
        memoryPoints.push({
          timeSec: tsToSec(ts),
          value: heap / (1024 * 1024),
        });
      }
      if (typeof nodes === "number") {
        domPoints.push({
          timeSec: tsToSec(ts),
          value: nodes,
        });
      }
    }

    if (name.startsWith("Resource")) {
      const data = (event.args?.data ?? {}) as Record<string, unknown>;
      const requestId =
        (data.requestId as string | undefined) ??
        (data.url as string | undefined) ??
        `${name}-${ts}`;

      if (name === "ResourceSendRequest") {
        networkRequests.set(requestId, {
          url: (data.url as string | undefined) ?? "unknown",
          method: (data.requestMethod as string | undefined) ?? "GET",
          startTs: ts,
        });
      }

      if (name === "ResourceReceiveResponse") {
        const entry = networkRequests.get(requestId);
        if (entry) {
          entry.status = data.statusCode as number | undefined;
          entry.type = data.mimeType as string | undefined;
        }
      }

      if (name === "ResourceFinish") {
        const entry = networkRequests.get(requestId);
        if (entry) {
          entry.endTs = ts;
          entry.transferSize = data.encodedDataLength as number | undefined;
          if (typeof entry.transferSize === "number") {
            totalTransfer += entry.transferSize;
          }
          totalNetworkLatency += (entry.endTs - entry.startTs) / 1000;
        }
      }
    }

    if (WEBGL_EVENT_HINTS.some((hint) => name.includes(hint))) {
      if (name.toLowerCase().includes("shader")) {
        webglShaderCompiles += 1;
      } else if (name.toLowerCase().includes("draw")) {
        webglDrawCalls += 1;
      } else {
        webglOtherEvents += 1;
      }
    }
  }

  if (scriptMs === 0 && fallback.samples.length > 0) {
    scriptMs = fallback.samples.reduce(
      (sum, sample) => sum + sample.scriptMs,
      0
    );
  }

  if (layoutMs === 0 && fallback.samples.length > 0) {
    layoutMs = fallback.samples.reduce(
      (sum, sample) => sum + sample.layoutMs,
      0
    );
  }

  const mapToSeries = (
    bucket: Map<number, number>,
    label: string,
    unit: string
  ) => {
    const points = [...bucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([timeSec, value]) => ({ timeSec, value }));
    return { label, unit, points };
  };

  const traceFpsPoints = mapToSeries(fpsMap, "FPS", "fps").points;
  const traceFpsMaxValue =
    traceFpsPoints.length > 0
      ? Math.max(...traceFpsPoints.map((p) => p.value))
      : 0;
  const traceFpsTimeSpan =
    traceFpsPoints.length >= 2
      ? Math.max(...traceFpsPoints.map((p) => p.timeSec)) -
        Math.min(...traceFpsPoints.map((p) => p.timeSec))
      : 0;
  const useTraceFps =
    useTraceForSeries &&
    fpsMap.size > 2 &&
    traceFpsTimeSpan >= wallClockDurationSec * 0.5 &&
    traceFpsMaxValue <= 200;

  const useTraceCpu =
    useTraceForSeries &&
    cpuBusyMap.size > 2 &&
    (() => {
      const pts = mapToSeries(cpuBusyMap, "CPU Busy", "ms").points;
      const span =
        pts.length >= 2
          ? Math.max(...pts.map((p) => p.timeSec)) -
            Math.min(...pts.map((p) => p.timeSec))
          : 0;
      return span >= wallClockDurationSec * 0.5;
    })();

  const useTraceGpu =
    useTraceForSeries &&
    gpuBusyMap.size > 2 &&
    (() => {
      const pts = mapToSeries(gpuBusyMap, "GPU Busy", "ms").points;
      const span =
        pts.length >= 2
          ? Math.max(...pts.map((p) => p.timeSec)) -
            Math.min(...pts.map((p) => p.timeSec))
          : 0;
      return span >= wallClockDurationSec * 0.5;
    })();

  const memoryTraceMaxTime =
    memoryPoints.length > 0
      ? Math.max(...memoryPoints.map((p) => p.timeSec))
      : 0;
  const useTraceMemory =
    useTraceForSeries &&
    memoryPoints.length > 0 &&
    memoryTraceMaxTime >= wallClockDurationSec * 0.8;

  const domTraceMaxTime =
    domPoints.length > 0 ? Math.max(...domPoints.map((p) => p.timeSec)) : 0;
  const useTraceDom =
    useTraceForSeries &&
    domPoints.length > 0 &&
    domTraceMaxTime >= wallClockDurationSec * 0.8;

  const capFps = (points: MetricPoint[], maxFps = 120): MetricPoint[] =>
    points.map((p) => ({
      ...p,
      value: Math.min(maxFps, Math.max(0, p.value)),
    }));

  const fpsSeries = useTraceFps
    ? {
        label: "FPS",
        unit: "fps",
        points: capFps(traceFpsPoints),
      }
    : {
        label: "FPS",
        unit: "fps",
        points: capFps(fallback.fpsSamples),
      };

  const cpuSeries = useTraceCpu
    ? mapToSeries(cpuBusyMap, "CPU Busy", "ms")
    : {
        label: "CPU Busy",
        unit: "ms",
        points: fallback.samples.map((sample) => ({
          timeSec: sample.timeSec,
          value: sample.cpuBusyMs,
        })),
      };

  const traceGpuPoints = mapToSeries(gpuBusyMap, "GPU Busy", "ms").points;
  const gpuSeries = useTraceGpu
    ? mapToSeries(gpuBusyMap, "GPU Busy", "ms")
    : traceGpuPoints.length === 1
    ? {
        label: "GPU Busy",
        unit: "ms",
        points: (() => {
          const val = traceGpuPoints[0].value;
          const pts: MetricPoint[] = [];
          for (let t = 0; t <= wallClockDurationSec; t += 10) {
            pts.push({ timeSec: t, value: val });
          }
          if (
            pts.length > 0 &&
            pts[pts.length - 1].timeSec < wallClockDurationSec
          ) {
            pts.push({
              timeSec: wallClockDurationSec,
              value: val,
            });
          }
          return pts;
        })(),
      }
    : { label: "GPU Busy", unit: "ms", points: [] };

  const memorySeries = useTraceMemory
    ? { label: "JS Heap", unit: "MB", points: memoryPoints }
    : {
        label: "JS Heap",
        unit: "MB",
        points: fallback.samples
          .filter((sample) => typeof sample.jsHeapMb === "number")
          .map((sample) => ({
            timeSec: sample.timeSec,
            value: sample.jsHeapMb ?? 0,
          })),
      };

  const domSeries = useTraceDom
    ? { label: "DOM Nodes", unit: "count", points: domPoints }
    : {
        label: "DOM Nodes",
        unit: "count",
        points: fallback.samples
          .filter((sample) => typeof sample.nodes === "number")
          .map((sample) => ({
            timeSec: sample.timeSec,
            value: sample.nodes ?? 0,
          })),
      };

  debugLog("parseTrace.seriesSource", {
    useTraceFps,
    useTraceCpu,
    useTraceGpu,
    useTraceMemory,
    useTraceDom,
    fpsMapSize: fpsMap.size,
    cpuBusyMapSize: cpuBusyMap.size,
    gpuBusyMapSize: gpuBusyMap.size,
    memoryPointsCount: memoryPoints.length,
    domPointsCount: domPoints.length,
    traceFpsMaxValue,
    traceFpsTimeSpan,
    memoryTraceMaxTime,
    domTraceMaxTime,
  });

  const logSeries = (name: string, points: MetricPoint[], source: string) => {
    if (points.length === 0) return;
    const times = points.map((p) => p.timeSec);
    const values = points.map((p) => p.value);
    debugLog(`parseTrace.series.${name}`, {
      source,
      pointCount: points.length,
      timeSecRange: [Math.min(...times), Math.max(...times)],
      valueRange: [Math.min(...values), Math.max(...values)],
    });
  };

  logSeries("fps", fpsSeries.points, useTraceFps ? "trace" : "fallback");
  logSeries("cpu", cpuSeries.points, useTraceCpu ? "trace" : "fallback");
  logSeries("gpu", gpuSeries.points, useTraceGpu ? "trace" : "fallback");
  logSeries(
    "memory",
    memorySeries.points,
    useTraceMemory ? "trace" : "fallback"
  );
  logSeries("dom", domSeries.points, useTraceDom ? "trace" : "fallback");

  const avgFps =
    fpsSeries.points.reduce((sum, point) => sum + point.value, 0) /
    Math.max(1, fpsSeries.points.length);

  const suggestions: PerfReport["suggestions"] = [];
  if (avgFps > 0 && avgFps < 50) {
    suggestions.push({
      title: "Low frame rate",
      detail:
        "Average FPS below 50. Reduce main-thread work or optimize animations.",
      severity: "warning",
    });
  }

  if (longTasks.length > 10) {
    suggestions.push({
      title: "Long tasks detected",
      detail:
        "Multiple tasks exceeded 50ms. Split heavy work or debounce handlers.",
      severity: "warning",
    });
  }

  if (layoutCount > 100 || layoutTimeMs > durationMs * 0.15) {
    suggestions.push({
      title: "High layout cost",
      detail:
        "Layout time is high. Audit layout thrashing and reduce forced reflows.",
      severity: "warning",
    });
  }

  if (paintCount > 150) {
    suggestions.push({
      title: "Frequent repaints",
      detail:
        "High paint count. Consider batching visual updates or simplifying effects.",
      severity: "info",
    });
  }

  const layoutAnimations = (fallback.collectedAnimations ?? []).filter(
    (a) => inferBottleneck(a.properties, a.name) === "layout"
  );
  if (layoutAnimations.length > 0) {
    suggestions.push({
      title: "Layout-triggering animations",
      detail: `${layoutAnimations.length} animation(s) use layout-triggering properties (e.g. width, margin). Prefer transform and opacity for smoother frames.`,
      severity: "warning",
    });
  }

  if (memoryPoints.length >= 2) {
    const startMem = memoryPoints[0].value;
    const endMem = memoryPoints[memoryPoints.length - 1].value;
    if (endMem > startMem * 1.2) {
      suggestions.push({
        title: "Memory growth",
        detail: "Heap usage grew notably. Check for retained objects or leaks.",
        severity: "warning",
      });
    }
  }

  const requestList =
    fallback.networkRequests.length > 0
      ? fallback.networkRequests
      : [...networkRequests.values()].map((request) => ({
          url: request.url,
          method: request.method,
          status: request.status,
          type: request.type,
          transferSize: request.transferSize,
          durationMs: request.endTs
            ? (request.endTs - request.startTs) / 1000
            : undefined,
        }));

  const averageLatency =
    requestList.length === 0 ? 0 : totalNetworkLatency / requestList.length;

  return {
    startedAt: new Date(startedAt).toISOString(),
    stoppedAt: new Date(stoppedAt).toISOString(),
    durationMs,
    fpsSeries,
    cpuSeries,
    gpuSeries,
    memorySeries,
    domNodesSeries: domSeries,
    layoutMetrics: {
      layoutCount,
      paintCount,
      layoutTimeMs,
      paintTimeMs,
    },
    longTasks: {
      count: longTasks.length,
      totalTimeMs: longTasks.reduce((sum, task) => sum + task.durationMs, 0),
      topTasks: longTasks
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 5),
    },
    networkSummary: {
      requests: requestList.length,
      totalBytes: totalTransfer,
      averageLatencyMs: averageLatency,
    },
    networkRequests: requestList,
    renderBreakdown: {
      scriptMs,
      layoutMs,
      rasterMs,
      compositeMs,
    },
    webglMetrics: {
      drawCalls: webglDrawCalls,
      shaderCompiles: webglShaderCompiles,
      otherEvents: webglOtherEvents,
    },
    animationMetrics: {
      animations: (fallback.collectedAnimations ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        startTimeSec: a.startTimeSec,
        durationMs: a.durationMs,
        delayMs: a.delayMs,
        properties: a.properties,
        bottleneckHint: inferBottleneck(a.properties, a.name),
      })),
      animationFrameEventsPerSec: mapToSeries(
        animationFrameMap,
        "Animation frames",
        "count"
      ),
      totalAnimations:
        (fallback.collectedAnimations?.length ?? 0) +
        [...animationFrameMap.values()].reduce((s, v) => s + v, 0),
    },
    webVitals: {
      tbtMs: 0,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce(
        (sum, task) => sum + task.durationMs,
        0
      ),
    },
    spikeFrames: [],
    video: null,
    suggestions,
  };
};

const buildFallbackReport = (
  startedAt: number,
  stoppedAt: number,
  fallback: {
    samples: PerfSample[];
    fpsSamples: MetricPoint[];
    networkRequests: PerfReport["networkRequests"];
    collectedAnimations?: CollectedAnimation[];
  }
): PerfReport => {
  const durationMs = Math.max(0, stoppedAt - startedAt);
  const totalScript = fallback.samples.reduce(
    (sum, sample) => sum + sample.scriptMs,
    0
  );
  const totalLayout = fallback.samples.reduce(
    (sum, sample) => sum + sample.layoutMs,
    0
  );
  const totalCpu = fallback.samples.reduce(
    (sum, sample) => sum + sample.cpuBusyMs,
    0
  );
  const totalBytes = fallback.networkRequests.reduce(
    (sum, request) => sum + (request.transferSize ?? 0),
    0
  );
  const avgLatency =
    fallback.networkRequests.length === 0
      ? 0
      : fallback.networkRequests.reduce(
          (sum, request) => sum + (request.durationMs ?? 0),
          0
        ) / fallback.networkRequests.length;

  return {
    startedAt: new Date(startedAt).toISOString(),
    stoppedAt: new Date(stoppedAt).toISOString(),
    durationMs,
    fpsSeries: { label: "FPS", unit: "fps", points: fallback.fpsSamples },
    cpuSeries: {
      label: "CPU Busy",
      unit: "ms",
      points: fallback.samples.map((sample) => ({
        timeSec: sample.timeSec,
        value: sample.cpuBusyMs,
      })),
    },
    gpuSeries: { label: "GPU Busy", unit: "ms", points: [] },
    memorySeries: {
      label: "JS Heap",
      unit: "MB",
      points: fallback.samples
        .filter((sample) => typeof sample.jsHeapMb === "number")
        .map((sample) => ({
          timeSec: sample.timeSec,
          value: sample.jsHeapMb ?? 0,
        })),
    },
    domNodesSeries: {
      label: "DOM Nodes",
      unit: "count",
      points: fallback.samples
        .filter((sample) => typeof sample.nodes === "number")
        .map((sample) => ({
          timeSec: sample.timeSec,
          value: sample.nodes ?? 0,
        })),
    },
    layoutMetrics: {
      layoutCount: 0,
      paintCount: 0,
      layoutTimeMs: totalLayout,
      paintTimeMs: 0,
    },
    longTasks: { count: 0, totalTimeMs: 0, topTasks: [] },
    networkSummary: {
      requests: fallback.networkRequests.length,
      totalBytes,
      averageLatencyMs: avgLatency,
    },
    networkRequests: fallback.networkRequests,
    renderBreakdown: {
      scriptMs: totalScript,
      layoutMs: totalLayout,
      rasterMs: 0,
      compositeMs: 0,
    },
    webglMetrics: { drawCalls: 0, shaderCompiles: 0, otherEvents: 0 },
    animationMetrics: {
      animations: (fallback.collectedAnimations ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        startTimeSec: a.startTimeSec,
        durationMs: a.durationMs,
        delayMs: a.delayMs,
        properties: a.properties,
        bottleneckHint: inferBottleneck(a.properties, a.name),
      })),
      animationFrameEventsPerSec: {
        label: "Animation frames",
        unit: "count",
        points: [],
      },
      totalAnimations: fallback.collectedAnimations?.length ?? 0,
    },
    webVitals: {
      tbtMs: fallback.samples.reduce(
        (sum, sample) => sum + Math.max(0, sample.cpuBusyMs - 50),
        0
      ),
      longTaskCount: 0,
      longTaskTotalMs: 0,
    },
    spikeFrames: [],
    video: null,
    suggestions:
      totalCpu > durationMs * 0.7
        ? [
            {
              title: "High CPU load",
              detail:
                "CPU busy time is high. Reduce main-thread work where possible.",
              severity: "warning",
            },
          ]
        : [],
  };
};

const ensureMemoryAndDomCollector = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as Window & {
      __perftraceMemory?: { heapMb: number; nodes: number };
    };
    if (w.__perftraceMemory !== undefined) return;
    const sample = () => {
      try {
        let heapMb = 0;
        if (
          typeof (
            performance as Performance & { memory?: { usedJSHeapSize: number } }
          ).memory?.usedJSHeapSize === "number"
        ) {
          heapMb =
            (
              performance as Performance & {
                memory?: { usedJSHeapSize: number };
              }
            ).memory!.usedJSHeapSize /
            (1024 * 1024);
        }
        const nodes = document.getElementsByTagName("*").length;
        w.__perftraceMemory = { heapMb, nodes };
      } catch {
        w.__perftraceMemory = { heapMb: 0, nodes: 0 };
      }
    };
    sample();
    setInterval(sample, 1500);
  });
};

const ensureClientCollectors = async (page: Page) => {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      __perftraceCollector?: ClientCollector;
    };
    if (globalWindow.__perftraceCollector) {
      return;
    }
    const collector: ClientCollector = {
      longTasks: [],
      cls: 0,
      fcp: undefined,
      lcp: undefined,
    };

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          collector.longTasks.push({
            start: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      // Long task observer unsupported.
    }

    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            collector.fcp = entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch {
      // Paint observer unsupported.
    }

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          collector.lcp = lastEntry.startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // LCP observer unsupported.
    }

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const casted = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!casted.hadRecentInput && typeof casted.value === "number") {
            collector.cls += casted.value;
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // CLS observer unsupported.
    }

    globalWindow.__perftraceCollector = collector;
  });
};

const ensureFpsCollector = async (page: Page) => {
  await page.evaluate(() => {
    const globalWindow = window as Window & {
      __perftrace?: { frames: number; last: number; samples: MetricPoint[] };
    };
    if (globalWindow.__perftrace) {
      return;
    }
    const state = {
      frames: 0,
      last: performance.now(),
      samples: [] as MetricPoint[],
    };
    const tick = () => {
      const now = performance.now();
      state.frames += 1;
      if (now - state.last >= 1000) {
        state.samples.push({
          timeSec: Math.max(0, Math.round(now / 1000)),
          value: state.frames,
        });
        state.frames = 0;
        state.last = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    globalWindow.__perftrace = state;
  });
};

const readClientCollectorSnapshot = async (page: Page) => {
  try {
    return (await page.evaluate(() => {
      const globalWindow = window as Window & {
        __perftraceCollector?: ClientCollector;
      };
      let collector = globalWindow.__perftraceCollector ?? null;
      try {
        const paints = performance.getEntriesByType?.("paint") ?? [];
        const fcpFallback = paints.find(
          (e) => e.name === "first-contentful-paint"
        )?.startTime;
        const lcps =
          performance.getEntriesByType?.("largest-contentful-paint") ?? [];
        const lcpFallback =
          lcps.length > 0 ? lcps[lcps.length - 1].startTime : undefined;
        const shifts = performance.getEntriesByType?.("layout-shift") ?? [];
        let clsFallback = 0;
        for (const e of shifts) {
          const entry = e as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!entry.hadRecentInput && typeof entry.value === "number")
            clsFallback += entry.value;
        }
        if (!collector) {
          return {
            longTasks: [],
            cls: clsFallback,
            fcp: fcpFallback,
            lcp: lcpFallback,
          } as ClientCollector;
        }
        return {
          ...collector,
          fcp: collector.fcp ?? fcpFallback,
          lcp: collector.lcp ?? lcpFallback,
          cls: Math.max(collector.cls ?? 0, clsFallback),
        };
      } catch {
        return collector;
      }
    })) as ClientCollector | null;
  } catch {
    return null;
  }
};

const deriveWebVitals = (
  collector: ClientCollector | null,
  longTasks: PerfReport["longTasks"]
): PerfReport["webVitals"] => {
  if (!collector) {
    return {
      tbtMs: 0,
      longTaskCount: longTasks.count,
      longTaskTotalMs: longTasks.totalTimeMs,
    };
  }

  const longTaskTotal = collector.longTasks.reduce(
    (sum, task) => sum + task.duration,
    0
  );
  const tbt = collector.longTasks.reduce(
    (sum, task) => sum + Math.max(0, task.duration - 50),
    0
  );

  return {
    fcpMs: collector.fcp,
    lcpMs: collector.lcp,
    cls: collector.cls,
    tbtMs: tbt,
    longTaskCount: collector.longTasks.length,
    longTaskTotalMs: longTaskTotal,
  };
};

const buildSpikeFrames = async (
  report: PerfReport,
  screenshots: Array<{ timeSec: number; path: string }>
): Promise<PerfReport["spikeFrames"]> => {
  if (screenshots.length === 0 || report.fpsSeries.points.length === 0) {
    return [];
  }

  const worstPoints = [...report.fpsSeries.points]
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.value - b.value)
    .slice(0, 5);

  const results: PerfReport["spikeFrames"] = [];
  for (const point of worstPoints) {
    const closest = screenshots.reduce((best, candidate) => {
      const bestDiff = Math.abs(best.timeSec - point.timeSec);
      const candidateDiff = Math.abs(candidate.timeSec - point.timeSec);
      return candidateDiff < bestDiff ? candidate : best;
    }, screenshots[0]);

    try {
      const fileData = await fs.readFile(closest.path);
      results.push({
        timeSec: point.timeSec,
        fps: point.value,
        imageDataUrl: `data:image/jpeg;base64,${fileData.toString("base64")}`,
      });
    } catch {
      continue;
    }
  }

  return results;
};

const cleanupScreenshots = async (
  screenshots: Array<{ timeSec: number; path: string }>
) => {
  await Promise.allSettled(screenshots.map((shot) => fs.unlink(shot.path)));
};

const selectBestVideoPath = async (
  pages: Page[],
  fallbackVideo: ReturnType<Page["video"]>
) => {
  const candidates: Array<{ path: string; size: number }> = [];
  for (const page of pages) {
    const video = page.video();
    if (!video) {
      continue;
    }
    try {
      const filePath = await video.path();
      const stats = await fs.stat(filePath);
      candidates.push({ path: filePath, size: stats.size });
    } catch {
      continue;
    }
  }

  if (candidates.length === 0 && fallbackVideo) {
    try {
      const filePath = await fallbackVideo.path();
      const stats = await fs.stat(filePath);
      candidates.push({ path: filePath, size: stats.size });
    } catch {
      // ignore
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].path;
};

const endCdpTrace = (cdp: CDPSession): Promise<string> =>
  new Promise((resolve, reject) => {
    const onComplete = (payload: { stream?: string }) => {
      cdp.off("Tracing.tracingComplete", onComplete);
      resolve(payload.stream ?? "");
    };
    cdp.on("Tracing.tracingComplete", onComplete);
    cdp.send("Tracing.end").catch((error) => {
      cdp.off("Tracing.tracingComplete", onComplete);
      reject(error);
    });
  });

const readTraceStream = async (cdp: CDPSession, stream: string) => {
  let result = "";
  while (true) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    result += chunk.data;
    if (chunk.eof) {
      break;
    }
  }
  await cdp.send("IO.close", { handle: stream });
  return result;
};

const parseTraceEvents = (traceText: string): TraceEvent[] => {
  try {
    const parsed = JSON.parse(traceText) as
      | { traceEvents?: TraceEvent[] }
      | TraceEvent[];

    return Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [];
  } catch {
    const lines = traceText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const events: TraceEvent[] = [];
    for (const line of lines) {
      try {
        const parsedLine = JSON.parse(line) as
          | {
              traceEvents?: TraceEvent[];
              events?: TraceEvent[];
              event?: TraceEvent;
            }
          | TraceEvent;

        if (Array.isArray(parsedLine)) {
          events.push(...parsedLine);
        } else if ("traceEvents" in parsedLine && parsedLine.traceEvents) {
          events.push(...parsedLine.traceEvents);
        } else if ("events" in parsedLine && parsedLine.events) {
          events.push(...parsedLine.events);
        } else if ("event" in parsedLine && parsedLine.event) {
          events.push(parsedLine.event);
        } else if (
          "name" in parsedLine &&
          "ts" in parsedLine &&
          (parsedLine.name != null || parsedLine.ts != null)
        ) {
          events.push(parsedLine as TraceEvent);
        }
      } catch {
        continue;
      }
    }
    return events;
  }
};

const readTraceFromZip = async (tracePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    yauzl.open(tracePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error("Failed to read trace zip."));
        return;
      }

      let resolved = false;

      const closeAndReject = (error: Error) => {
        if (resolved) {
          return;
        }
        zipfile.close();
        reject(error);
      };

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        if (
          entry.fileName.endsWith("trace.trace") ||
          entry.fileName.endsWith("trace.json")
        ) {
          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              closeAndReject(streamError ?? new Error("Failed to read trace."));
              return;
            }

            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("error", closeAndReject);
            stream.on("end", () => {
              resolved = true;
              zipfile.close();
              resolve(Buffer.concat(chunks).toString("utf-8"));
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        closeAndReject(new Error("Trace data not found in zip."));
      });
    });
  });
