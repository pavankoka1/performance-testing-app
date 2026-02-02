import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import yauzl from "yauzl";
import type { PerfReport, MetricPoint } from "./reportTypes";

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
  tracePath: string;
  startedAt: number;
};

let activeSession: TraceSession | null = null;

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

const RASTER_EVENT_NAMES = new Set([
  "Rasterize",
  "RasterTask",
  "GPUTask",
]);

const COMPOSITE_EVENT_NAMES = new Set([
  "CompositeLayers",
  "UpdateLayerTree",
]);

const LAYOUT_EVENT_NAMES = new Set(["Layout", "UpdateLayoutTree"]);

const PAINT_EVENT_NAMES = new Set(["Paint", "PaintImage"]);

const WEBGL_EVENT_HINTS = ["WebGL", "glDraw", "GL.Draw", "DrawElements"];

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
  const headless =
    process.env.PERFTRACE_HEADLESS === "true" || isServerless;

  if (isServerless && headless) {
    const serverlessChromium = await import("@sparticuz/chromium");
    return {
      headless: true,
      executablePath: await serverlessChromium.executablePath(),
      args: serverlessChromium.args,
      defaultViewport: serverlessChromium.defaultViewport,
    };
  }

  return {
    headless,
    args: ["--disable-dev-shm-usage"],
  };
};

export const startRecording = async (url: string) => {
  if (activeSession) {
    throw new Error("A recording session is already running.");
  }

  const safeUrl = ensureValidUrl(url);
  const launchOptions = await getLaunchOptions();

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 },
  });
  const page = await context.newPage();

  const tracePath = path.join(
    os.tmpdir(),
    `perftrace-${randomUUID()}.zip`,
  );

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
    title: "PerfTrace Session",
  });

  await page.goto(safeUrl, { waitUntil: "domcontentloaded" });

  activeSession = {
    browser,
    context,
    page,
    tracePath,
    startedAt: Date.now(),
  };

  return {
    status: "recording",
    url: safeUrl,
  };
};

export const stopRecording = async (): Promise<PerfReport> => {
  if (!activeSession) {
    throw new Error("No active session to stop.");
  }

  const { browser, context, tracePath, startedAt } = activeSession;
  activeSession = null;

  try {
    await context.tracing.stop({ path: tracePath });
  } finally {
    await browser.close();
  }

  const stoppedAt = Date.now();
  const report = await parseTrace(tracePath, startedAt, stoppedAt);
  await fs.unlink(tracePath);
  return report;
};

const parseTrace = async (
  tracePath: string,
  startedAt: number,
  stoppedAt: number,
): Promise<PerfReport> => {
  const traceText = await readTraceFromZip(tracePath);
  const parsed = JSON.parse(traceText) as
    | { traceEvents?: TraceEvent[] }
    | TraceEvent[];

  const events = Array.isArray(parsed)
    ? parsed
    : parsed.traceEvents ?? [];

  const timestamps = events
    .map((event) => event.ts)
    .filter((value): value is number => typeof value === "number");

  const startTs = timestamps.length ? Math.min(...timestamps) : 0;
  const endTs = timestamps.length ? Math.max(...timestamps) : 0;
  const durationMs = startTs === endTs ? stoppedAt - startedAt : (endTs - startTs) / 1000;

  const fpsMap = new Map<number, number>();
  const cpuBusyMap = new Map<number, number>();
  const gpuBusyMap = new Map<number, number>();
  const memoryPoints: MetricPoint[] = [];
  const domPoints: MetricPoint[] = [];

  let layoutCount = 0;
  let paintCount = 0;
  let layoutTimeMs = 0;
  let paintTimeMs = 0;

  const longTasks: Array<{ name: string; durationMs: number; startSec: number }> = [];

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

  const addToBucket = (bucket: Map<number, number>, ts: number, value: number) => {
    const second = Math.max(0, Math.floor((ts - startTs) / 1_000_000));
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

    if (name === "RunTask" && dur / 1000 > 50) {
      longTasks.push({
        name,
        durationMs: dur / 1000,
        startSec: Math.max(0, (ts - startTs) / 1_000_000),
      });
    }

    if (name === "UpdateCounters") {
      const data = (event.args?.data ?? {}) as Record<string, number>;
      const heap = data.jsHeapSizeUsed ?? data.jsHeapSize ?? data.usedJSHeapSize;
      const nodes = data.nodes ?? data.documentCount;
      if (typeof heap === "number") {
        memoryPoints.push({
          timeSec: Math.max(0, (ts - startTs) / 1_000_000),
          value: heap / (1024 * 1024),
        });
      }
      if (typeof nodes === "number") {
        domPoints.push({
          timeSec: Math.max(0, (ts - startTs) / 1_000_000),
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

  const mapToSeries = (bucket: Map<number, number>, label: string, unit: string) => {
    const points = [...bucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([timeSec, value]) => ({ timeSec, value }));
    return { label, unit, points };
  };

  const fpsSeries = mapToSeries(fpsMap, "FPS", "fps");
  const cpuSeries = mapToSeries(cpuBusyMap, "CPU Busy", "ms");
  const gpuSeries = mapToSeries(gpuBusyMap, "GPU Busy", "ms");
  const memorySeries = {
    label: "JS Heap",
    unit: "MB",
    points: memoryPoints,
  };
  const domSeries = {
    label: "DOM Nodes",
    unit: "count",
    points: domPoints,
  };

  const avgFps =
    fpsSeries.points.reduce((sum, point) => sum + point.value, 0) /
    Math.max(1, fpsSeries.points.length);

  const suggestions: PerfReport["suggestions"] = [];
  if (avgFps > 0 && avgFps < 50) {
    suggestions.push({
      title: "Low frame rate",
      detail: "Average FPS below 50. Reduce main-thread work or optimize animations.",
      severity: "warning",
    });
  }

  if (longTasks.length > 10) {
    suggestions.push({
      title: "Long tasks detected",
      detail: "Multiple tasks exceeded 50ms. Split heavy work or debounce handlers.",
      severity: "warning",
    });
  }

  if (layoutCount > 100 || layoutTimeMs > durationMs * 0.15) {
    suggestions.push({
      title: "High layout cost",
      detail: "Layout time is high. Audit layout thrashing and reduce forced reflows.",
      severity: "warning",
    });
  }

  if (paintCount > 150) {
    suggestions.push({
      title: "Frequent repaints",
      detail: "High paint count. Consider batching visual updates or simplifying effects.",
      severity: "info",
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

  const requestList = [...networkRequests.values()].map((request) => ({
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
    suggestions,
  };
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
