"use client";

import { BarChart2, ListChecks, Layers, MemoryStick } from "lucide-react";
import MetricChart from "./MetricChart";
import type { PerfReport } from "@/lib/reportTypes";

type ReportViewerProps = {
  report: PerfReport | null;
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

const formatBytes = (value: number) => {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(value) / 3));
  const adjusted = value / 1024 ** index;
  return `${formatNumber(adjusted)} ${units[index]}`;
};

export default function ReportViewer({ report }: ReportViewerProps) {
  if (!report) {
    return (
      <section className="rounded-2xl border border-white/10 bg-base-800/60 p-6 text-sm text-white/60">
        Run a session to generate a performance report.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-base-800/90 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Session Report
          </h2>
          <p className="text-sm text-white/60">
            {new Date(report.startedAt).toLocaleString()} →{" "}
            {new Date(report.stoppedAt).toLocaleString()} (
            {formatNumber(report.durationMs / 1000)}s)
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-white/70">
          <div className="rounded-full border border-white/10 px-3 py-1">
            Requests: {report.networkSummary.requests}
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            Avg latency: {formatNumber(report.networkSummary.averageLatencyMs)}ms
          </div>
          <div className="rounded-full border border-white/10 px-3 py-1">
            Transfer: {formatBytes(report.networkSummary.totalBytes)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <MetricChart
          title="FPS over time"
          unit="fps"
          data={report.fpsSeries.points}
        />
        <MetricChart
          title="CPU busy time"
          unit="ms"
          data={report.cpuSeries.points}
        />
        <MetricChart
          title="GPU busy time"
          unit="ms"
          data={report.gpuSeries.points}
        />
        <MetricChart
          title="JS heap"
          unit="MB"
          data={report.memorySeries.points}
        />
        <MetricChart
          title="DOM nodes"
          unit="count"
          data={report.domNodesSeries.points}
        />
        <MetricChart
          title="Layout & paint totals"
          unit="ms"
          type="bar"
          data={[
            { timeSec: 1, value: report.layoutMetrics.layoutTimeMs },
            { timeSec: 2, value: report.layoutMetrics.paintTimeMs },
          ]}
          labelFormatter={(point) =>
            point.timeSec === 1 ? "Layout" : "Paint"
          }
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-base-900/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart2 className="h-4 w-4 text-indigo-300" />
            Render breakdown
          </div>
          <div className="space-y-2 text-sm text-white/70">
            <p>Script: {formatNumber(report.renderBreakdown.scriptMs)}ms</p>
            <p>Layout: {formatNumber(report.renderBreakdown.layoutMs)}ms</p>
            <p>Raster: {formatNumber(report.renderBreakdown.rasterMs)}ms</p>
            <p>Composite: {formatNumber(report.renderBreakdown.compositeMs)}ms</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-base-900/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-indigo-300" />
            Layout & paint
          </div>
          <div className="space-y-2 text-sm text-white/70">
            <p>Layouts: {report.layoutMetrics.layoutCount}</p>
            <p>Paints: {report.layoutMetrics.paintCount}</p>
            <p>Layout time: {formatNumber(report.layoutMetrics.layoutTimeMs)}ms</p>
            <p>Paint time: {formatNumber(report.layoutMetrics.paintTimeMs)}ms</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-base-900/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <MemoryStick className="h-4 w-4 text-indigo-300" />
            WebGL metrics
          </div>
          <div className="space-y-2 text-sm text-white/70">
            <p>Draw calls: {report.webglMetrics.drawCalls}</p>
            <p>Shader compiles: {report.webglMetrics.shaderCompiles}</p>
            <p>Other events: {report.webglMetrics.otherEvents}</p>
          </div>
        </div>
      </div>

      <details className="mt-8 rounded-xl border border-white/10 bg-base-900/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Bottleneck suggestions
        </summary>
        <div className="mt-3 space-y-2 text-sm text-white/70">
          {report.suggestions.length === 0 ? (
            <p>No major bottlenecks detected in this session.</p>
          ) : (
            report.suggestions.map((suggestion) => (
              <div
                key={suggestion.title}
                className="rounded-lg border border-white/10 bg-base-800/70 px-3 py-2"
              >
                <p className="font-medium text-white">{suggestion.title}</p>
                <p className="text-white/70">{suggestion.detail}</p>
              </div>
            ))
          )}
        </div>
      </details>

      <details className="mt-6 rounded-xl border border-white/10 bg-base-900/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Long tasks & network requests
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-indigo-300" />
              Long tasks ({report.longTasks.count})
            </div>
            <div className="space-y-2 text-sm text-white/70">
              <p>Total time: {formatNumber(report.longTasks.totalTimeMs)}ms</p>
              {report.longTasks.topTasks.length === 0 ? (
                <p>No long tasks captured.</p>
              ) : (
                report.longTasks.topTasks.map((task) => (
                  <div key={`${task.name}-${task.startSec}`}>
                    {task.name} — {formatNumber(task.durationMs)}ms at{" "}
                    {formatNumber(task.startSec)}s
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs text-white/70">
              <thead className="sticky top-0 bg-base-900 text-[11px] uppercase text-white/50">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {report.networkRequests.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3" colSpan={4}>
                      No network requests captured.
                    </td>
                  </tr>
                ) : (
                  report.networkRequests.map((request) => (
                    <tr
                      key={`${request.url}-${request.durationMs ?? 0}`}
                      className="border-t border-white/10"
                    >
                      <td className="px-3 py-2">
                        <p className="truncate" title={request.url}>
                          {request.method} {request.url}
                        </p>
                        <p className="text-[11px] text-white/40">
                          {request.type ?? "unknown"}
                        </p>
                      </td>
                      <td className="px-3 py-2">{request.status ?? "-"}</td>
                      <td className="px-3 py-2">
                        {request.transferSize
                          ? formatBytes(request.transferSize)
                          : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {request.durationMs
                          ? `${formatNumber(request.durationMs)}ms`
                          : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
