# CPU & Performance Tracking with Playwright and Chromium — Technical Overview

**Document purpose:** POC review and implementation reference for performance testing using Playwright and Chromium.  
**Audience:** Engineering review, stakeholders, and developers implementing or extending the tool.

---

## 1. Executive Summary

This POC uses **Playwright** to drive **Chromium** and capture performance data via **Chrome DevTools Protocol (CDP)** and **in-page APIs**. CPU (and related) metrics are obtained from:

1. **CDP Performance domain** — cumulative counters (task duration, script, layout) polled on an interval.
2. **CDP Tracing** — timeline events (RunTask, script, layout, paint, GPU) parsed from a trace stream.
3. **In-page Performance Observers** — long tasks, FCP, LCP, CLS, and FPS from the browser’s Performance API.

The result is a unified **performance report** with time-series (CPU, FPS, GPU, memory, DOM), render breakdown, long tasks, Web Vitals, and suggestions.

---

## 2. What Are Playwright and Chromium?

### 2.1 Chromium

- **What it is:** The open-source browser project that powers Chrome, Edge, and others. It includes the Blink renderer, V8 JavaScript engine, and the **Chrome DevTools Protocol (CDP)** server.
- **Why it matters for performance:** CDP exposes low-level instrumentation (metrics, tracing, emulation) that we use to measure CPU, GPU, layout, script, and memory without modifying the target page’s code.

### 2.2 Playwright

- **What it is:** A browser automation library (by Microsoft) that can launch and control Chromium, Firefox, and WebKit via a single API.
- **Why it matters for this POC:**
  - Launches and controls a **real** Chromium instance (optionally visible for manual testing).
  - Creates **CDP sessions** attached to a page so we can send CDP commands (e.g. `Performance.enable`, `Tracing.start`, `Emulation.setCPUThrottlingRate`).
  - Records **video** of the session and supports **tracing** (screenshots, snapshots, sources) for correlation with metrics.

Together, Chromium provides the instrumentation, and Playwright provides the automation and CDP access to collect and control it.

---

## 3. How CPU Performance Is Tracked

CPU usage is derived from **two independent sources** and then merged or chosen in the report.

### 3.1 Source 1: CDP Performance domain (polling)

- **Mechanism:** After navigating to the target URL, we attach a CDP session and call:
  - `Performance.enable`
  - Then every **2 seconds** we call `Performance.getMetrics`.
- **What we read:** The returned metrics include (names can vary by Chromium version):
  - **TaskDuration** — total main-thread task time (cumulative).
  - **ScriptDuration** — time spent in JavaScript (V8).
  - **LayoutDuration** — time spent in layout/reflow.

We compute **deltas** between two consecutive polls (e.g. `deltaTask = (current TaskDuration - previous TaskDuration) * 1000` to get milliseconds). Those deltas are stored as **CPU busy time** for that 2-second window and form a **time series** (one point every ~2s).

- **Pros:** Simple, works in headless and headed, no trace parsing.
- **Cons:** Only as frequent as the poll interval; no per-task detail; cumulative counters can be absent or zero in some environments.

### 3.2 Source 2: CDP Tracing (Chrome trace events)

- **Mechanism:** We start a trace with `Tracing.start` and a fixed set of **categories** (see below). When the user stops the session we call `Tracing.end`, read the trace stream via CDP `IO.read`, and parse the JSON trace.
- **What we use for CPU:** We iterate over trace events and look for:
  - **RunTask** (and events in `toplevel`-like categories) with `ph: "X"` (complete events) and a duration `dur`.
  - We bucket these by time: `second = floor((eventTimestamp - traceStart) / traceTsToSec)` and sum `dur` (in ms) into a **cpuBusyMap** (per-second CPU busy time).
- **Pros:** Per-event detail, aligns with other trace events (script, layout, paint, GPU), can cover the full session if the trace spans it.
- **Cons:** Trace timestamps can be in microseconds or milliseconds (we infer); trace may only cover part of the session; parsing is heavier.

### 3.3 Choosing the series for the report

- If the **trace** has enough buckets (e.g. multiple seconds) and spans most of the session, we use the **trace-derived CPU series**.
- Otherwise we use the **polling-derived (fallback) CPU series** from the 2-second `Performance.getMetrics` deltas.

Both are stored as **time-series** of `(timeSec, cpuBusyMs)` and shown in the **CPU busy time** chart.

---

## 4. Chrome DevTools Protocol (CDP) — What We Use

| CDP domain / method                | Purpose                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Animation.enable**               | (Experimental) Enables the Animation domain; we listen to `Animation.animationStarted` to capture CSS/Web Animations with keyframes and properties.               |
| **Performance.enable**             | Turns on the Performance metrics collection for the target.                                                                                                       |
| **Performance.getMetrics**         | Returns current cumulative metrics (TaskDuration, ScriptDuration, LayoutDuration, JSHeapUsedSize, Nodes, etc.). We poll this every 2s for CPU and other counters. |
| **Tracing.start**                  | Starts a trace with the given categories and `transferMode: "ReturnAsStream"`.                                                                                    |
| **Tracing.end**                    | Stops the trace; we then receive `Tracing.tracingComplete` with a stream handle.                                                                                  |
| **IO.read**                        | Reads the trace stream chunk by chunk until EOF.                                                                                                                  |
| **Emulation.setCPUThrottlingRate** | Slows down the CPU (e.g. 4x, 6x) to simulate low-end devices.                                                                                                     |

### Tracing categories we enable

- `devtools.timeline` — general timeline (includes RunTask, etc.).
- `disabled-by-default-devtools.timeline.frame` — frame-related events (for FPS).
- `disabled-by-default-devtools.timeline.paint` — paint events.
- `disabled-by-default-devtools.timeline.layers` — layer updates.
- `disabled-by-default-devtools.timeline.stack` — stack info.
- `blink.user_timing` — user timing marks.
- `v8` — V8/script execution.
- `gpu` — GPU work.

These feed into **CPU** (RunTask, toplevel), **FPS** (frame events), **GPU** (gpu category), **script/layout/paint** (script/layout/paint event names), and **long tasks** (RunTask with duration &gt; 50 ms).

---

## 5. Metrics We Collect and How They Relate to CPU

### 5.1 CPU-related metrics (direct)

| Metric                          | Source                                                                                 | Description                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **CPU busy time (time series)** | CDP Performance (deltas) or CDP Tracing (RunTask / toplevel)                           | Main-thread time per interval (ms). High values mean the main thread is busy and can block input and rendering. |
| **Long tasks**                  | Trace: `RunTask` with `dur > 50 ms`; also in-page `PerformanceObserver` for `longtask` | Tasks longer than ~50 ms. Count and total time; we list top 5 by duration. Used for TBT and suggestions.        |
| **Total Blocking Time (TBT)**   | In-page long-task observer: sum of `max(0, duration - 50)` per long task               | Approximates TBT (main-thread blocking time). Also derived from trace long tasks when observer isn’t available. |
| **Render breakdown — Script**   | Trace: events like `EvaluateScript`, `V8.Execute`, `CompileScript`, `FunctionCall`     | Total script execution time (ms). Directly tied to CPU (V8).                                                    |
| **Render breakdown — Layout**   | Trace: `Layout`, `UpdateLayoutTree`                                                    | Total layout/reflow time (ms). CPU work on the main thread.                                                     |

### 5.2 Other metrics (context for CPU analysis)

| Metric                           | Source                                                                                                             | Description                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **FPS**                          | Trace: frame events (DrawFrame, BeginFrame, etc.) or in-page `requestAnimationFrame` counter                       | Frames per second. Low FPS often indicates CPU (or GPU) saturation.                         |
| **GPU busy time**                | Trace: events in `gpu` category or name containing "GPU"                                                           | GPU work per second. Complements CPU (offload and bottlenecks).                             |
| **JS Heap**                      | CDP Performance (JSHeapUsedSize) and/or in-page `performance.memory.usedJSHeapSize`                                | Heap usage (MB). High or growing heap can imply more GC and CPU cost.                       |
| **DOM nodes**                    | CDP (Nodes/DOMNodeCount) and/or in-page `document.getElementsByTagName('*').length`                                | DOM size. Large trees increase layout/style cost (CPU).                                     |
| **Layout/Paint counts and time** | Trace: Layout/Paint event names                                                                                    | Layout and paint event counts and total time; inform “layout thrashing” and paint cost.     |
| **Web Vitals (FCP, LCP, CLS)**   | In-page PerformanceObserver (paint, largest-contentful-paint, layout-shift)                                        | Load and stability metrics; FCP/LCP can be delayed by CPU.                                  |
| **Network**                      | Playwright `request` / `requestfinished` (and trace Resource\* events)                                             | Request count, latency, size. Network can affect how much CPU is used (parsing, execution). |
| **Animation metrics**            | CDP Animation domain (animationStarted) + trace events (AnimationFrame, FireAnimationFrame, RequestAnimationFrame) | Per-animation properties, duration, bottleneck hint (layout / paint / compositor).          |

---

## 6. End-to-end Flow (Recording Session)

1. **User** enters a URL and optionally selects CPU throttling (1x, 4x, 6x).
2. **Backend** calls Playwright to launch Chromium (or @sparticuz/chromium in serverless), create a context (viewport, video recording), and open a page.
3. **CDP**
   - A first CDP session is used for **tracing**: `Performance.enable`, then `Tracing.start` with the categories above.
   - A second CDP session is used for **metrics**: `Performance.enable`, and optionally `Emulation.setCPUThrottlingRate(rate)`.
4. **In-page scripts** (injected before navigation where possible):
   - Long-task observer (`longtask`), paint (FCP), LCP, CLS.
   - FPS: `requestAnimationFrame` counter, sampled every second.
   - Memory/DOM: periodic read of `performance.memory` and DOM node count (with fallbacks).
5. **Navigation** to the target URL (`domcontentloaded`).
6. **Polling loop** (every 2 s):
   - `Performance.getMetrics` → compute deltas for TaskDuration, ScriptDuration, LayoutDuration, and optionally JSHeapUsedSize, Nodes (or use in-page values).
   - Store one sample: `(timeSec, cpuBusyMs, scriptMs, layoutMs, jsHeapMb?, nodes?)`.
7. **User** interacts; optionally new tabs/pages get the same collectors and metrics CDP (and throttling) applied.
8. **On stop:**
   - Read in-page FPS and long-task/Web Vitals state.
   - Stop tracing, read trace stream, close browser.
   - **Parse trace**: compute FPS, CPU, GPU, script, layout, paint, long tasks, etc., and build time series where applicable.
   - **Merge/choose** series: use trace-based series if they cover most of the session; otherwise use polling-based (and in-page) series.
   - **Normalize** time ranges and extend series to full session length if needed.
   - **Derive** Web Vitals (TBT, FCP, LCP, CLS) from in-page collector and trace long tasks.
   - **Build** the final report (time series, breakdowns, suggestions) and return it to the front end.

---

## 7. Summary Table — Metrics and Sources

| Metric                     | Primary source                                      | Fallback / secondary                             |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| CPU busy time              | CDP Tracing (RunTask / toplevel)                    | CDP Performance.getMetrics (TaskDuration deltas) |
| Long tasks                 | Trace RunTask &gt; 50 ms; in-page longtask observer | Trace only                                       |
| TBT                        | In-page longtask observer                           | Trace long tasks (approximation)                 |
| FPS                        | Trace frame events                                  | In-page rAF counter                              |
| GPU busy time              | Trace gpu events                                    | Synthetic from single bucket if needed           |
| JS Heap                    | Trace UpdateCounters; CDP getMetrics                | In-page performance.memory + polling             |
| DOM nodes                  | Trace UpdateCounters; CDP getMetrics                | In-page DOM count + polling                      |
| Script/Layout/Paint totals | Trace event names and durations                     | —                                                |
| FCP / LCP / CLS            | In-page PerformanceObserver                         | —                                                |
| Animation metrics          | CDP Animation.animationStarted; trace rAF events    | —                                                |
| Network                    | Playwright request events + trace Resource\*        | —                                                |

---

## 8. Limitations and Considerations

- **Trace length and timing:** Trace may not cover the full session (e.g. buffer limits or late start). We use wall-clock duration and extend or prefer fallback series when trace coverage is insufficient.
- **Trace timestamp units:** Chrome can emit timestamps in microseconds or milliseconds. We infer the unit from the trace span and normalize so all series use seconds relative to session start.
- **Headless vs headed:** All of the above works in both; serverless (e.g. Vercel) typically runs headless with @sparticuz/chromium. Visible browser is mainly for local/manual POC use.
- **CPU throttling:** `Emulation.setCPUThrottlingRate` is applied when starting the session (and for new pages in the same context) to simulate slower devices; it affects all CPU-derived metrics.
- **Animation domain:** CDP Animation is experimental; `Animation.enable` may not be available in all Chromium builds. When available, we infer bottleneck hints (layout / paint / compositor) from animated CSS properties. Prefer `transform` and `opacity` for compositor-only, smoother animations.

---

## 9. References

- [Chrome DevTools Protocol — Performance domain](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
- [Chrome DevTools Protocol — Tracing](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/)
- [Chrome DevTools Protocol — Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)
- [Playwright — Browser contexts and CDP](https://playwright.dev/docs/api/class-browsercontext)
- [Long Tasks and TBT](https://web.dev/long-tasks-devtools/)
- [Chrome trace event format](https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU)

---

_This document describes the current POC implementation. Implementation details (e.g. exact event names, thresholds, and fallback logic) may evolve; the codebase and logs (e.g. `[PerfTrace]`) remain the source of truth._
