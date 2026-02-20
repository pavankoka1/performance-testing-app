# PerfTrace — Performance Testing App: Complete Roadmap & Technical Guide

This document provides an in-depth roadmap to understanding the PerfTrace codebase—from architecture and data flow to metric calculations and optimization strategies.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Layout & App Structure](#2-layout--app-structure)
3. [Recording Pipeline](#3-recording-pipeline)
4. [Metric Calculation Deep Dive](#4-metric-calculation-deep-dive)
5. [Animation & Properties Extraction](#5-animation--properties-extraction)
6. [Report Generation & Processing](#6-report-generation--processing)
7. [Component Hierarchy & Data Flow](#7-component-hierarchy--data-flow)
8. [Glossary of Terms](#8-glossary-of-terms)
9. [React Performance Capture](#9-react-performance-capture-one-stop-overview)
10. [Quick Fixes Reference](#10-quick-fixes-reference)

---

## 1. Architecture Overview

PerfTrace is a **Next.js 16** application that uses **Playwright** to launch a Chromium browser, record a performance session (video + trace), and produce an analyzable report.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js App (Client)                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Dashboard → URLInput, RecordButtons, LiveMetricsPanel      │  │
│  │           → ReportViewer (charts, animations, video)         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                    POST /api/record (start|stop)                  │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                     API Route (Server)                            │
│  /api/record → startRecording() | stopRecording() | GET video    │
└─────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────┐
│                    playwrightUtils.ts                            │
│  • Playwright Chromium launch                                    │
│  • CDP: Tracing, Performance, Animation                           │
│  • Client inject: FPS, memory, DOM, Web Vitals, animations       │
│  • Trace parsing → PerfReport                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Key technologies:**

- **Playwright** — Browser automation, CDP sessions
- **Chrome DevTools Protocol (CDP)** — Tracing, Performance metrics, Animation domain
- **Chromium trace** — Timestamped events (frame, layout, paint, etc.)
- **Client-side scripts** — FPS, memory, DOM count, Web Vitals

---

## 2. Layout & App Structure

### Root Layout (`src/app/layout.tsx`)

```tsx
<html lang="en" className="dark">
  <body
    className={`${inter.variable} font-sans antialiased bg-[var(--bg)] text-[var(--fg)]`}
  >
    {children}
  </body>
</html>
```

- **Font**: Inter (weights 400, 500, 600, 700) via `next/font`
- **Theme**: Dark mode (`className="dark"`)
- **CSS variables**: Defined in `globals.css` — `--bg`, `--fg`, `--accent`, etc.

### Page Structure (`src/app/page.tsx`)

Renders a single component: `<Dashboard />`.

### Global Styles (`src/app/globals.css`)

- `:root` defines color-scheme, `--bg`, `--bg-card`, `--accent`, `--border`, etc.
- `text-gradient` for the PerfTrace logo
- Tailwind v4 `@import "tailwindcss"`

---

## 3. Recording Pipeline

### 3.1 Start Recording

1. **Validate URL** — Must be `http://` or `https://`
2. **Launch Chromium** — Headless or headed depending on env
3. **Create context** — Viewport 1366×768, `recordVideo` enabled
4. **CDP sessions**:
   - `traceCdp`: For `Tracing.start` / `Tracing.end`
   - `metricsCdp`: For `Performance.enable`, `Animation.enable`, `Emulation.setCPUThrottlingRate`
5. **Inject client scripts**:
   - `ensureClientCollectors` — Web Vitals (FCP, LCP, CLS, long tasks)
   - `ensureMemoryAndDomCollector` — Heap size, DOM node count
   - `ensureFpsCollector` — `requestAnimationFrame`-based FPS
6. **Intervals**:
   - **2s**: `Performance.getMetrics` → CPU busy, script, layout; + client memory/DOM
   - **3s**: Screenshot (max 12)
   - **2s**: Viewport lock
7. **Navigation** — `page.goto(url, { waitUntil: 'domcontentloaded' })`

### 3.2 Stop Recording

1. Stop intervals
2. Read client FPS samples from `window.__perftrace.samples`
3. Read Web Vitals from `window.__perftraceCollector`
4. Stop tracing, read trace stream
5. Close browser/context
6. `parseTrace()` or `buildFallbackReport()`
7. `buildSpikeFrames()`, `deriveWebVitals()`, `normalizeReportTimeRange()`
8. Return `PerfReport`

---

## 4. Metric Calculation Deep Dive

### 4.1 FPS (Frames Per Second)

**Sources (in order of preference):**

1. **Trace events** — `DrawFrame`, `BeginFrame`, `SwapBuffers`, `CompositeLayers`
   - Bucketed by second: `fpsMap.set(second, count)`
   - Used if: `useTraceForSeries`, `fpsMap.size > 2`, time span ≥ 50% of session, max value ≤ 200
2. **Client FPS** — `ensureFpsCollector`
   - `requestAnimationFrame` loop counts frames per second
   - Pushes `{ timeSec, value: frames }` every 1000ms
   - `timeSec` = `performance.now() / 1000` (relative to page load)

**Formula:** For each second, FPS = number of frame events in that second.

### 4.2 CPU Busy Time (ms)

**Sources:**

1. **Trace** — Events with `cat` including "toplevel" or `name === "RunTask"`
   - `event.ph === "X"` (complete), `dur` in microseconds → `dur / 1000` ms
   - Bucketed by second
2. **CDP fallback** — `Performance.getMetrics` → `TaskDuration` (cumulative)
   - Delta between samples: `deltaTask = (current - previous) * 1000` ms

### 4.3 GPU Busy Time (ms)

**Source:** Trace events with `cat.includes("gpu")` or `name.includes("GPU")`

- Same bucketing as CPU
- No CDP fallback; often empty if trace lacks GPU events

### 4.4 JS Heap (MB)

**Sources:**

1. **Trace** — `UpdateCounters` events with `data.jsHeapSizeUsed` / `jsHeapSize` / `usedJSHeapSize`
2. **Client** — `performance.memory.usedJSHeapSize` (Chrome-only)
3. **CDP** — `JSHeapUsedSize` / `JSHeapSize` from `Performance.getMetrics`

Value converted to MB: `heap / (1024 * 1024)`.

### 4.5 DOM Nodes

**Sources:**

1. **Trace** — `UpdateCounters` with `data.nodes` / `data.documentCount`
2. **Client** — `document.getElementsByTagName("*").length`
3. **CDP** — `Nodes` / `DOMNodeCount`

### 4.6 Layout & Paint

**Trace only:**

- **Layout**: Events `Layout`, `UpdateLayoutTree` — count and `dur` summed
- **Paint**: Events `Paint`, `PaintImage` — count and `dur` summed

### 4.7 Long Tasks

**Definition:** `RunTask` events with `dur > 50ms`

- Collected from trace
- Also from client `PerformanceObserver` for `longtask` entries

**Total Blocking Time (TBT):**  
`Σ max(0, duration - 50)` over all long tasks.

### 4.8 Web Vitals

| Metric | Source                                                                            |
| ------ | --------------------------------------------------------------------------------- |
| FCP    | `PerformanceObserver` type `paint`, `first-contentful-paint`                      |
| LCP    | `PerformanceObserver` type `largest-contentful-paint`                             |
| CLS    | `PerformanceObserver` type `layout-shift`, sum of `value` where `!hadRecentInput` |
| TBT    | From long tasks as above                                                          |

### 4.9 Animation Frames Per Second

**Trace:** Events matching `AnimationFrame`, `FireAnimationFrame`, `RequestAnimationFrame`, `Animation Frame Fired`, `DrawFrame`, `BeginFrame`, `SwapBuffers`, `CompositeLayers`

- Bucketed by second
- **Fallback** if trace categories don’t emit these; fallback report uses `points: []`
- **Fix:** Use FPS series as fallback (each frame ≈ one rAF)

---

## 5. Animation & Properties Extraction

### 5.1 CDP `Animation.animationStarted`

When an animation starts, CDP fires with an `Animation` object:

- `id`, `name`, `type` (CSSTransition | CSSAnimation | WebAnimation)
- `source` (AnimationEffect): `duration`, `delay`, `keyframesRule`

**KeyframesRule:**

- `keyframes`: array of `KeyframeStyle`
- PDL defines `KeyframeStyle` with only `offset` and `easing`
- Chromium may serialize extra fields (e.g. `style`) with CSS property keys

**Properties extraction (current):**

```ts
for (const kf of keyframeList) {
  const style = kf.style;
  if (style && typeof style === "object") {
    for (const key of Object.keys(style)) {
      if (key !== "offset" && key !== "easing" && !properties.includes(key))
        properties.push(key);
    }
  }
}
```

### 5.2 Why Properties Are Often "Unknown"

1. **CSSTransition** — No `keyframesRule`; transitions interpolate between two states; property may live in `source.transitionProperty` (non-standard / implementation-specific).
2. **KeyframeStyle** — PDL doesn’t include `style`; Chromium may or may not add it.
3. **Animation domain** — Experimental; can fail silently.

### 5.3 Bottleneck Inference

`inferBottleneck(properties, animationName)`:

- **Layout**: `width`, `height`, `top`, `left`, `margin`, `padding`, `border`, `font-size`, `display`, `position`
- **Paint**: `color`, `background`, `box-shadow`, `outline`, `filter`, `border-radius`
- **Compositor**: `transform`, `opacity`
- **Name hints**: `cc-*` → compositor, `blink-*` → layout, `fade`/`opacity`/`transform` → compositor

If no properties and no name hint → `undefined` → shown as "unknown" in the legend.

---

## 6. Report Generation & Processing

### 6.1 PerfReport Structure

```ts
PerfReport = {
  startedAt,
  stoppedAt,
  durationMs,
  fpsSeries,
  cpuSeries,
  gpuSeries,
  memorySeries,
  domNodesSeries,
  layoutMetrics,
  longTasks,
  networkSummary,
  networkRequests,
  renderBreakdown,
  webglMetrics,
  animationMetrics,
  webVitals,
  spikeFrames,
  video,
  suggestions,
};
```

### 6.2 Trace Parsing

1. Read trace from zip or stream
2. Parse JSON/NDJSON → `TraceEvent[]`
3. Derive `startTs`, `endTs`; handle timestamps in µs vs ms
4. For each event, update: `fpsMap`, `cpuBusyMap`, `gpuBusyMap`, `memoryPoints`, `domPoints`, `animationFrameMap`, `longTasks`, network requests, WebGL
5. Decide per series: use trace or fallback (samples / fpsSamples)
6. Build `PerfReport`

### 6.3 Fallback Report

When trace parsing fails or is insufficient, use:

- CDP `Performance.getMetrics` samples
- Client FPS samples
- Context/network data
- `animationFrameEventsPerSec: { points: [] }` (no animation frame data)

### 6.4 Normalization

- Adjust `timeSec` if values look like ms
- Clamp to `[0, durationSec]`
- `extendSeriesToFullDuration` — fill gaps at start/end

### 6.5 Spike Frames

- Take 5 lowest FPS points
- Find nearest screenshot by `timeSec`
- Attach base64 image → `spikeFrames`

### 6.6 HTML Report Export

- **Export button** in ReportViewer triggers `downloadReportHtml(report)`
- Builds a standalone HTML file with summary cards, tables (animations, long tasks, network, suggestions), spike frames, and formatting
- Filename: `perftrace-report-{ISO datetime}.html`
- Can be opened in a browser and printed to PDF via File → Print → Save as PDF

---

## 7. Component Hierarchy & Data Flow

```
Dashboard (state: url, cpuThrottle, isRecording, isProcessing, report)
├── Toaster
├── Header
├── URLInput, CPU select, RecordButtons
├── LiveMetricsPanel (isRecording)
├── MetricsGlossary
├── ProcessingLoader | ReportViewer
│   ReportViewer (report)
│   ├── MetricChart ×6 (FPS, CPU, GPU, Memory, DOM, Layout&Paint, Animation FPS)
│   ├── AnimationTimeline
│   ├── GraphModal, SpikeFrameModal
│   └── SessionTimeline
```

**Re-render optimization:**

- `RecordButtons`, `URLInput`, `LiveMetricsPanel`, `MetricsGlossary`, `ProcessingLoader`, `ReportViewer` are wrapped in `React.memo`—they only re-render when their props change.
- `handleStart` and `handleStop` use `useCallback` for stable references.

---

## 8. Glossary of Terms

| Term          | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| CDP           | Chrome DevTools Protocol                                           |
| Trace         | Chromium trace events (JSON) from `Tracing.start`                  |
| FPS           | Frames per second (from frame events or rAF)                       |
| TBT           | Total Blocking Time (sum of [task duration - 50ms] for long tasks) |
| CLS           | Cumulative Layout Shift                                            |
| FCP           | First Contentful Paint                                             |
| LCP           | Largest Contentful Paint                                           |
| rAF           | `requestAnimationFrame`                                            |
| KeyframeStyle | CDP type for a keyframe; may include `style` with CSS properties   |
| Bottleneck    | Layout / Paint / Compositor category for an animation              |

---

## File Reference

| File                    | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `layout.tsx`            | Root layout, font, theme                    |
| `page.tsx`              | Renders Dashboard                           |
| `Dashboard.tsx`         | Main state, recording logic, layout         |
| `ReportViewer.tsx`      | Report UI, charts, animation timeline       |
| `AnimationTimeline.tsx` | Animation bars, bottleneck legend           |
| `playwrightUtils.ts`    | Recording, trace parsing, report building   |
| `reportTypes.ts`        | Types for `PerfReport`, `MetricPoint`, etc. |
| `reportUtils.ts`        | `getVitalsAtTime`, `getClosestFrameAtTime`  |
| `reportExport.ts`       | `buildReportHtml`, `downloadReportHtml`     |
| `api/record/route.ts`   | POST start/stop, GET video/metrics          |

---

## 9. React Performance Capture (One-Stop Overview)

PerfTrace captures React performance via **react-render-tracker** when enabled. The following is captured and surfaced:

### Currently Captured

| Data                     | Source                                                           | Where Shown                                         |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------- |
| **Component re-renders** | RRT events (fiber, owner)                                        | Chart, timeline, component table                    |
| **Component name**       | `fiber.type.name`, `fiber.type.displayName`, `fiber.displayName` | All sections                                        |
| **Parent hierarchy**     | Owner chain (`owner → owner.owner → …`)                          | Chart tooltip, component table "Parent hierarchy"   |
| **Triggered by**         | Direct owner (who caused the render)                             | Component table, chart tooltip                      |
| **Bursts**               | 5+ renders in 15-event window                                    | Burst warning, burst details, timeline (amber bars) |
| **Re-renders chart**     | Time-bucketed count (Y) vs time (X)                              | Area chart with hover tooltip showing components    |

### Re-renders Chart

- **X-axis**: Timeline (seconds)
- **Y-axis**: Re-render count per bucket
- **Hover tooltip**: Lists components that re-rendered in that bucket, with parent hierarchy (e.g. `Parent → GrandParent`)

### What Else Could Be Captured (Future)

| Metric                  | How                                   | Notes                                                                       |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| **Render duration**     | React `<Profiler>` or reconciler hook | Target app must wrap tree with Profiler; or patch React internals (fragile) |
| **Why did it render?**  | React DevTools logic                  | Would need reconciler hooks; RRT doesn't expose this                        |
| **Context consumers**   | Fiber dependencies                    | Possible if RRT exposes context info                                        |
| **Commit phase timing** | Profiler `onRender`                   | Same as render duration                                                     |

RRT works best with **development builds**; production builds often yield many anonymous components.

---

## 10. Quick Fixes Reference

| Issue                        | Solution                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animation FPS empty          | Fallback to FPS series or client FPS samples when trace animation frame events are sparse                                                                                  |
| Animation properties unknown | CDP: `transitionProperty`, `cssProperty`, keyframe keys. Client: `document.getAnimations()` + `effect.getKeyframes()` merged on stop                                       |
| Export report                | "Export HTML Report" button → downloads `.html`; use Print → Save as PDF for PDF                                                                                           |
| Re-renders                   | `memo` on child components, `useCallback` for handlers                                                                                                                     |
| Track React re-renders       | "Track React re-renders" checkbox; uses react-render-tracker (React apps, dev build recommended). Chart shows count vs time; tooltip lists components and parent hierarchy |
| Layout thrashing hints       | Trace detects Layout bursts (5+ in 16ms or 10+ in 50ms); Developer Hints section with mitigation advice                                                                    |

---

_Last updated: Feb 2025_
