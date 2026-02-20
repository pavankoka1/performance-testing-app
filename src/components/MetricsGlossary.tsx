"use client";

import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Layout,
  MemoryStick,
  MousePointer,
  Network,
  Paintbrush,
  Zap,
} from "lucide-react";
import { memo, useState } from "react";

const metrics = [
  {
    id: "fps",
    name: "FPS (Frames per second)",
    icon: Gauge,
    what: "Number of frames the browser paints per second. 60 FPS is the target for smooth visuals; lower values mean jank or stutter.",
    mitigate:
      "Reduce main-thread work, use requestAnimationFrame for animations, avoid layout thrashing, and prefer CSS transforms over layout-triggering properties.",
  },
  {
    id: "cpu",
    name: "CPU busy time",
    icon: Cpu,
    what: "Time the main thread spent doing work (tasks, script, layout). High CPU usage blocks input and animations.",
    mitigate:
      "Split long tasks with setTimeout(0) or requestIdleCallback, defer non-critical JS, use Web Workers for heavy computation, and optimize hot paths.",
  },
  {
    id: "gpu",
    name: "GPU busy time",
    icon: Zap,
    what: "Time the GPU spent on compositing, rasterization, and draw calls. High GPU time can indicate expensive paints or too many layers.",
    mitigate:
      "Reduce layer count, use will-change sparingly, simplify shadows and blurs, and prefer GPU-friendly effects (transforms, opacity).",
  },
  {
    id: "js-heap",
    name: "JS Heap",
    icon: MemoryStick,
    what: "JavaScript heap memory used by the page. Growing heap suggests retained objects or potential memory leaks.",
    mitigate:
      "Release references when done, avoid global caches that grow unbounded, use WeakMap/WeakSet where appropriate, and profile with the Memory tab.",
  },
  {
    id: "dom-nodes",
    name: "DOM nodes",
    icon: Layout,
    what: "Number of DOM elements. Large trees slow down layout, style, and hit-testing.",
    mitigate:
      "Keep the DOM small: virtualize long lists, remove detached nodes, avoid deeply nested structures, and lazy-render off-screen content.",
  },
  {
    id: "layout",
    name: "Layout / Reflow",
    icon: Layout,
    what: "Browser recalculating geometry (positions, sizes). Forced synchronous layouts (reading layout after writes) cause thrashing.",
    mitigate:
      "Batch reads and writes, avoid reading offsetHeight/offsetTop etc. in loops, use CSS containment, and prefer flex/grid over manual sizing.",
  },
  {
    id: "paint",
    name: "Paint",
    icon: Paintbrush,
    what: "Time spent painting pixels to layers. Expensive paints come from complex CSS, large areas, or many elements.",
    mitigate:
      "Reduce paint area (containment, overflow: hidden), simplify box-shadows and filters, and use compositor-only animations where possible.",
  },
  {
    id: "fcp",
    name: "FCP (First Contentful Paint)",
    icon: Paintbrush,
    what: "When the first text or image is painted. Measures perceived load start.",
    mitigate:
      "Minimize render-blocking resources, inline critical CSS, reduce server latency, and optimize font loading.",
  },
  {
    id: "lcp",
    name: "LCP (Largest Contentful Paint)",
    icon: Paintbrush,
    what: "When the largest visible content element is painted. Core Web Vital for load experience.",
    mitigate:
      "Optimize LCP resource (image/video/font), use priority hints, preload key resources, and reduce main-thread work before LCP.",
  },
  {
    id: "cls",
    name: "CLS (Cumulative Layout Shift)",
    icon: MousePointer,
    what: "Stability of layout: unexpected shifts (e.g. images loading without dimensions) hurt UX. Score under 0.1 is good.",
    mitigate:
      "Set width/height on images and embeds, reserve space for dynamic content, avoid inserting content above existing content, and use font-display: optional to reduce text shift.",
  },
  {
    id: "tbt",
    name: "TBT (Total Blocking Time)",
    icon: Cpu,
    what: "Total time the main thread was blocked (tasks over ~50ms). Affects interactivity and FCP/LCP.",
    mitigate:
      "Break up long tasks, reduce JavaScript execution time, and defer or lazy-load non-critical script.",
  },
  {
    id: "long-tasks",
    name: "Long tasks",
    icon: Cpu,
    what: "Tasks that run longer than ~50ms. They block the main thread and cause input delay and frame drops.",
    mitigate:
      "Split work into smaller chunks, use requestIdleCallback for non-urgent work, move heavy logic to Web Workers, and optimize third-party scripts.",
  },
  {
    id: "network",
    name: "Network requests & latency",
    icon: Network,
    what: "Number of requests, total bytes, and average latency. Affects load time and runtime fetches.",
    mitigate:
      "Reduce request count (bundle, combine), compress assets, use a CDN, enable HTTP/2, and cache appropriately.",
  },
];

function MetricsGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-[var(--bg-elevated)]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
          <Gauge className="h-4 w-4 text-amber-400/90" />
          Performance metrics explained
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--fg-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--fg-muted)]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-6 py-4">
          <p className="mb-4 text-xs text-[var(--fg-muted)]">
            What we measure and how to improve each metric.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                    {m.name}
                  </div>
                  <p className="mb-2 text-xs text-[var(--fg-muted)]">
                    {m.what}
                  </p>
                  <p className="text-xs text-emerald-400/90">
                    <span className="font-medium text-[var(--fg)]">
                      Mitigate:
                    </span>{" "}
                    {m.mitigate}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default memo(MetricsGlossary);
