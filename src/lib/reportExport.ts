import type { PerfReport } from "./reportTypes";

const formatNum = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

const formatBytes = (value: number) => {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(value) / 3));
  return `${formatNum(value / 1024 ** index)} ${units[index]}`;
};

export function buildReportHtml(report: PerfReport): string {
  const durationSec = report.durationMs / 1000;
  const fpsAvg =
    report.fpsSeries.points.length > 0
      ? report.fpsSeries.points.reduce((s, p) => s + p.value, 0) /
        report.fpsSeries.points.length
      : 0;
  const cpuAvg =
    report.cpuSeries.points.length > 0
      ? report.cpuSeries.points.reduce((s, p) => s + p.value, 0) /
        report.cpuSeries.points.length
      : 0;

  const animRows = (report.animationMetrics?.animations ?? [])
    .map(
      (a) =>
        `<tr>
          <td>${escapeHtml(a.name || "(unnamed)")}</td>
          <td>${a.type}</td>
          <td>${(a.properties ?? []).join(", ") || "—"}</td>
          <td>${a.bottleneckHint ?? "—"}</td>
          <td>${
            a.durationMs != null ? formatNum(a.durationMs) + " ms" : "—"
          }</td>
        </tr>`
    )
    .join("");

  const suggestionRows = report.suggestions
    .map(
      (s) =>
        `<tr>
          <td><span class="badge badge-${s.severity}">${s.severity}</span></td>
          <td><strong>${escapeHtml(s.title)}</strong></td>
          <td>${escapeHtml(s.detail)}</td>
        </tr>`
    )
    .join("");

  const longTaskRows = report.longTasks.topTasks
    .map(
      (t) =>
        `<tr>
          <td>${escapeHtml(t.name)}</td>
          <td>${formatNum(t.durationMs)} ms</td>
          <td>${formatNum(t.startSec)} s</td>
        </tr>`
    )
    .join("");

  const networkRows = report.networkRequests
    .slice(0, 50)
    .map(
      (r) =>
        `<tr>
          <td class="url-cell">${escapeHtml(r.url)}</td>
          <td>${r.method}</td>
          <td>${r.status ?? "—"}</td>
          <td>${r.transferSize != null ? formatBytes(r.transferSize) : "—"}</td>
          <td>${
            r.durationMs != null ? formatNum(r.durationMs) + " ms" : "—"
          }</td>
        </tr>`
    )
    .join("");

  const spikeFramesHtml =
    report.spikeFrames.length > 0
      ? report.spikeFrames
          .map(
            (f) =>
              `<div class="spike-frame">
                <img src="${f.imageDataUrl}" alt="Spike at ${f.timeSec}s" />
                <p>${formatNum(f.timeSec)}s · ${Math.round(f.fps)} FPS</p>
              </div>`
          )
          .join("")
      : "<p>No spike frames captured.</p>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PerfTrace Report — ${new Date(
    report.startedAt
  ).toLocaleString()}</title>
  <style>
    :root { --bg: #0c0c0f; --fg: #f4f4f5; --muted: #a1a1aa; --accent: #8b5cf6; --border: rgba(255,255,255,0.08); }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 2rem; line-height: 1.6; }
    h1 { font-size: 1.75rem; margin: 0 0 0.5rem; background: linear-gradient(135deg,#6d28d9,#a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: var(--fg); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    p { margin: 0.5rem 0; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 0.7rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .card { background: #141418; border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; }
    .card-label { font-size: 0.7rem; text-transform: uppercase; color: var(--muted); }
    .card-value { font-size: 1.5rem; font-weight: 600; color: var(--accent); }
    .badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; }
    .badge-warning { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .badge-info { background: rgba(59,130,246,0.2); color: #3b82f6; }
    .badge-critical { background: rgba(239,68,68,0.2); color: #ef4444; }
    .spike-frames { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; }
    .spike-frame { flex: 1 1 180px; background: #141418; border-radius: 0.5rem; overflow: hidden; border: 1px solid var(--border); }
    .spike-frame img { width: 100%; height: auto; display: block; }
    .spike-frame p { padding: 0.5rem; margin: 0; font-size: 0.75rem; }
    .url-cell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
</head>
<body>
  <header>
    <h1>PerfTrace — Performance Report</h1>
    <p>${new Date(report.startedAt).toLocaleString()} → ${new Date(
    report.stoppedAt
  ).toLocaleString()} (${formatNum(durationSec)}s)</p>
  </header>

  <h2>Summary</h2>
  <div class="grid">
    <div class="card"><span class="card-label">Avg FPS</span><div class="card-value">${formatNum(
      fpsAvg
    )}</div></div>
    <div class="card"><span class="card-label">Avg CPU (ms)</span><div class="card-value">${formatNum(
      cpuAvg
    )}</div></div>
    <div class="card"><span class="card-label">TBT (ms)</span><div class="card-value">${formatNum(
      report.webVitals.tbtMs
    )}</div></div>
    <div class="card"><span class="card-label">Long Tasks</span><div class="card-value">${
      report.webVitals.longTaskCount
    }</div></div>
    <div class="card"><span class="card-label">FCP</span><div class="card-value">${
      report.webVitals.fcpMs != null
        ? formatNum(report.webVitals.fcpMs) + "ms"
        : "—"
    }</div></div>
    <div class="card"><span class="card-label">LCP</span><div class="card-value">${
      report.webVitals.lcpMs != null
        ? formatNum(report.webVitals.lcpMs) + "ms"
        : "—"
    }</div></div>
    <div class="card"><span class="card-label">CLS</span><div class="card-value">${
      report.webVitals.cls != null ? formatNum(report.webVitals.cls) : "—"
    }</div></div>
  </div>

  <h2>Layout & Paint</h2>
  <p>Layouts: ${report.layoutMetrics.layoutCount} | Paints: ${
    report.layoutMetrics.paintCount
  } | Layout time: ${formatNum(
    report.layoutMetrics.layoutTimeMs
  )}ms | Paint time: ${formatNum(report.layoutMetrics.paintTimeMs)}ms</p>

  <h2>Render Breakdown</h2>
  <p>Script: ${formatNum(
    report.renderBreakdown.scriptMs
  )}ms | Layout: ${formatNum(
    report.renderBreakdown.layoutMs
  )}ms | Raster: ${formatNum(
    report.renderBreakdown.rasterMs
  )}ms | Composite: ${formatNum(report.renderBreakdown.compositeMs)}ms</p>

  <h2>Network</h2>
  <p>Requests: ${report.networkSummary.requests} | Total: ${formatBytes(
    report.networkSummary.totalBytes
  )} | Avg latency: ${formatNum(report.networkSummary.averageLatencyMs)}ms</p>

  <h2>Animations & Properties</h2>
  <table>
    <thead><tr><th>Name</th><th>Type</th><th>Properties</th><th>Bottleneck</th><th>Duration</th></tr></thead>
    <tbody>${
      animRows || "<tr><td colspan='5'>No animations captured.</td></tr>"
    }</tbody>
  </table>

  <h2>Long Tasks</h2>
  <table>
    <thead><tr><th>Task</th><th>Duration</th><th>Start (s)</th></tr></thead>
    <tbody>${
      longTaskRows || "<tr><td colspan='3'>No long tasks.</td></tr>"
    }</tbody>
  </table>

  <h2>Network Requests</h2>
  <table>
    <thead><tr><th>URL</th><th>Method</th><th>Status</th><th>Size</th><th>Duration</th></tr></thead>
    <tbody>${
      networkRows || "<tr><td colspan='5'>No requests.</td></tr>"
    }</tbody>
  </table>

  <h2>Suggestions</h2>
  <table>
    <thead><tr><th>Severity</th><th>Title</th><th>Detail</th></tr></thead>
    <tbody>${
      suggestionRows ||
      "<tr><td colspan='3'>No major bottlenecks detected.</td></tr>"
    }</tbody>
  </table>

  <h2>FPS Spike Frames</h2>
  <div class="spike-frames">${spikeFramesHtml}</div>

  ${
    report.developerHints
      ? `
  <h2>Developer hints</h2>
  ${
    report.developerHints.layoutThrashing
      ? `
  <p><strong>Layout thrashing:</strong> ${
    report.developerHints.layoutThrashing.detected
      ? `Detected ${
          report.developerHints.layoutThrashing.layoutsInWorstBurst
        } layout events within ${
          report.developerHints.layoutThrashing.windowMs
        }ms at ${formatNum(
          report.developerHints.layoutThrashing.worstBurstAtSec
        )}s. Batch DOM reads before writes.`
      : "No significant layout thrashing detected."
  }</p>
  `
      : ""
  }
  ${
    report.developerHints.reactRerenders
      ? `
  <p><strong>React re-renders:</strong> ${
    report.developerHints.reactRerenders.totalEvents
  } events across ${
          report.developerHints.reactRerenders.components.length
        } components${
          (report.developerHints.reactRerenders.bursts?.length ?? 0) > 0
            ? ` — ${
                report.developerHints.reactRerenders.bursts!.length
              } burst windows`
            : ""
        }</p>
  <table>
    <thead><tr><th>Component</th><th>Re-renders</th><th>Triggered by</th><th>In bursts</th></tr></thead>
    <tbody>
      ${(report.developerHints.reactRerenders.topRerenderers ?? [])
        .map(
          (c) =>
            `<tr><td>${escapeHtml(c.name)}</td><td>${c.count}</td><td>${
              (c as { triggeredBy?: string }).triggeredBy
                ? escapeHtml((c as { triggeredBy?: string }).triggeredBy!)
                : "—"
            }</td><td>${(c as { inBursts?: number }).inBursts ?? 0}</td></tr>`
        )
        .join("")}
    </tbody>
  </table>
  ${
    (report.developerHints.reactRerenders.bursts?.length ?? 0) > 0
      ? `
  <p class="mt-3"><strong>Burst windows:</strong></p>
  <ul>
    ${(report.developerHints.reactRerenders.bursts ?? [])
      .slice(0, 5)
      .map(
        (b: {
          startTimeSec: number;
          endTimeSec: number;
          count: number;
          topComponents: Array<{ name: string; count: number }>;
        }) =>
          `<li>${formatNum(b.startTimeSec)}s–${formatNum(b.endTimeSec)}s: ${
            b.count
          } renders — ${b.topComponents
            .map((c) => c.name + " (" + c.count + ")")
            .join(", ")}</li>`
      )
      .join("")}
  </ul>
  `
      : ""
  }
  `
      : ""
  }
  `
      : ""
  }

  <footer style="margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--muted);">
    Generated by PerfTrace — ${new Date().toISOString()}
  </footer>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export function downloadReportHtml(report: PerfReport, filename?: string) {
  const html = buildReportHtml(report);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ??
    `perftrace-report-${new Date(report.startedAt)
      .toISOString()
      .slice(0, 19)
      .replace(/[:-]/g, "")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
