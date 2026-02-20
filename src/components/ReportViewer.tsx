"use client";

import { downloadReportHtml } from "@/lib/reportExport";
import type { PerfReport } from "@/lib/reportTypes";
import {
  Activity,
  BarChart2,
  Download,
  Layers,
  ListChecks,
  MemoryStick,
  PlayCircle,
  Sparkles,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import AnimationTimeline from "./AnimationTimeline";
import GraphModal from "./GraphModal";
import MetricChart from "./MetricChart";
import ReactRerendersSection from "./ReactRerendersSection";
import SessionTimeline from "./SessionTimeline";
import SpikeFrameModal from "./SpikeFrameModal";

type ReportViewerProps = {
  report: PerfReport | null;
};

type GraphModalState = {
  title: string;
  unit: string;
  data: PerfReport["fpsSeries"]["points"];
} | null;

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

const formatBytes = (value: number) => {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log10(value) / 3));
  const adjusted = value / 1024 ** index;
  return `${formatNumber(adjusted)} ${units[index]}`;
};

function ReportViewer({ report }: ReportViewerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reportTimeSec, setReportTimeSec] = useState(0);
  const [spikeModalFrame, setSpikeModalFrame] = useState<
    PerfReport["spikeFrames"][0] | null
  >(null);
  const [graphModal, setGraphModal] = useState<GraphModalState>(null);

  const durationSec = report ? report.durationMs / 1000 : 0;

  useEffect(() => {
    if (!report) return;
    setReportTimeSec(0);
  }, [report]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !report?.video) return;
    const syncFromVideo = () => setReportTimeSec(v.currentTime);
    v.addEventListener("timeupdate", syncFromVideo);
    return () => v.removeEventListener("timeupdate", syncFromVideo);
  }, [report?.video]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !report?.video) return;
    if (Number.isNaN(v.duration) || v.duration <= 0) return;
    if (Math.abs(v.currentTime - reportTimeSec) < 0.25) return;
    v.currentTime = reportTimeSec;
  }, [report?.video, reportTimeSec]);

  if (!report) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]/80 p-8 text-center text-sm text-[var(--fg-muted)]">
        Run a session to generate a performance report.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--fg)]">
            Session Report
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {new Date(report.startedAt).toLocaleString()} →{" "}
            {new Date(report.stoppedAt).toLocaleString()}{" "}
            <span className="text-[var(--fg)]">
              ({(report.durationMs / 1000).toFixed(1)}s full session)
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--fg-muted)]">
          <button
            type="button"
            onClick={() => downloadReportHtml(report)}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-dim)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export HTML Report
          </button>
          <div className="rounded-full border border-[var(--border)] px-3 py-1">
            Requests: {report.networkSummary.requests}
          </div>
          <div className="rounded-full border border-[var(--border)] px-3 py-1">
            Avg latency: {formatNumber(report.networkSummary.averageLatencyMs)}
            ms
          </div>
          <div className="rounded-full border border-[var(--border)] px-3 py-1">
            Transfer: {formatBytes(report.networkSummary.totalBytes)}
          </div>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-2">
        <MetricChart
          title="FPS over time"
          unit="fps"
          data={report.fpsSeries.points}
          durationSec={durationSec}
          yDomain={[0, 120]}
          onOpenModal={() =>
            setGraphModal({
              title: "FPS over time",
              unit: "fps",
              data: report.fpsSeries.points,
            })
          }
        />
        <MetricChart
          title="CPU busy time"
          unit="ms"
          data={report.cpuSeries.points}
          durationSec={durationSec}
          onOpenModal={() =>
            setGraphModal({
              title: "CPU busy time",
              unit: "ms",
              data: report.cpuSeries.points,
            })
          }
        />
        <MetricChart
          title="GPU busy time"
          unit="ms"
          data={report.gpuSeries.points}
          durationSec={durationSec}
          onOpenModal={() =>
            setGraphModal({
              title: "GPU busy time",
              unit: "ms",
              data: report.gpuSeries.points,
            })
          }
        />
        <MetricChart
          title="JS heap"
          unit="MB"
          data={report.memorySeries.points}
          durationSec={durationSec}
          onOpenModal={() =>
            setGraphModal({
              title: "JS heap",
              unit: "MB",
              data: report.memorySeries.points,
            })
          }
        />
        <MetricChart
          title="DOM nodes"
          unit="count"
          data={report.domNodesSeries.points}
          durationSec={durationSec}
          onOpenModal={() =>
            setGraphModal({
              title: "DOM nodes",
              unit: "count",
              data: report.domNodesSeries.points,
            })
          }
        />
        <MetricChart
          title="Layout & paint totals"
          unit="ms"
          type="bar"
          data={[
            { timeSec: 1, value: report.layoutMetrics.layoutTimeMs },
            { timeSec: 2, value: report.layoutMetrics.paintTimeMs },
          ]}
          labelFormatter={(point) => (point.timeSec === 1 ? "Layout" : "Paint")}
        />
        <MetricChart
          title="Animation frames per second"
          unit="count"
          data={
            report.animationMetrics?.animationFrameEventsPerSec?.points ?? []
          }
          durationSec={durationSec}
          onOpenModal={() =>
            setGraphModal({
              title: "Animation frames per second",
              unit: "count",
              data:
                report.animationMetrics?.animationFrameEventsPerSec?.points ??
                [],
            })
          }
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <BarChart2 className="h-4 w-4 text-[var(--accent)]" />
            Render breakdown
          </div>
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>Script: {formatNumber(report.renderBreakdown.scriptMs)}ms</p>
            <p>Layout: {formatNumber(report.renderBreakdown.layoutMs)}ms</p>
            <p>Raster: {formatNumber(report.renderBreakdown.rasterMs)}ms</p>
            <p>
              Composite: {formatNumber(report.renderBreakdown.compositeMs)}ms
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <Layers className="h-4 w-4 text-[var(--accent)]" />
            Layout & paint
          </div>
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>Layouts: {report.layoutMetrics.layoutCount}</p>
            <p>Paints: {report.layoutMetrics.paintCount}</p>
            <p>
              Layout time: {formatNumber(report.layoutMetrics.layoutTimeMs)}ms
            </p>
            <p>
              Paint time: {formatNumber(report.layoutMetrics.paintTimeMs)}ms
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <MemoryStick className="h-4 w-4 text-[var(--accent)]" />
            WebGL metrics
          </div>
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>Draw calls: {report.webglMetrics.drawCalls}</p>
            <p>Shader compiles: {report.webglMetrics.shaderCompiles}</p>
            <p>Other events: {report.webglMetrics.otherEvents}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            Animation metrics
          </div>
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Total animations: {report.animationMetrics?.totalAnimations ?? 0}
            </p>
            <p>
              Tracked (CDP): {report.animationMetrics?.animations?.length ?? 0}
            </p>
            <p>
              rAF frames (trace):{" "}
              {(
                report.animationMetrics?.animationFrameEventsPerSec?.points ??
                []
              ).reduce((s, p) => s + p.value, 0)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
            <Activity className="h-4 w-4 text-[var(--accent)]" />
            Web Vitals & TBT
          </div>
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              FCP:{" "}
              {report.webVitals.fcpMs !== undefined
                ? `${formatNumber(report.webVitals.fcpMs)}ms`
                : "-"}
            </p>
            <p>
              LCP:{" "}
              {report.webVitals.lcpMs !== undefined
                ? `${formatNumber(report.webVitals.lcpMs)}ms`
                : "-"}
            </p>
            <p>
              CLS:{" "}
              {report.webVitals.cls !== undefined
                ? formatNumber(report.webVitals.cls)
                : "-"}
            </p>
            <p>TBT: {formatNumber(report.webVitals.tbtMs)}ms</p>
            <p>Long tasks: {report.webVitals.longTaskCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          Animations & properties — timeline
        </div>
        <AnimationTimeline
          animations={report.animationMetrics?.animations ?? []}
          durationSec={durationSec}
          formatNumber={formatNumber}
        />
      </div>

      {(report.developerHints?.layoutThrashing ||
        report.developerHints?.reactRerenders) && (
        <details className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">
            <Wrench className="mr-2 inline h-4 w-4" />
            Developer hints
          </summary>
          <div className="mt-4 space-y-4">
            {report.developerHints?.layoutThrashing && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
                <p className="mb-2 text-sm font-medium text-[var(--fg)]">
                  Layout thrashing
                </p>
                {report.developerHints.layoutThrashing.detected ? (
                  <p className="text-xs text-[var(--fg-muted)]">
                    Detected{" "}
                    {report.developerHints.layoutThrashing.layoutsInWorstBurst}{" "}
                    layout events within{" "}
                    {report.developerHints.layoutThrashing.windowMs}ms at{" "}
                    {formatNumber(
                      report.developerHints.layoutThrashing.worstBurstAtSec
                    )}
                    s. Batch DOM reads before writes; avoid offsetHeight /
                    getBoundingClientRect in loops.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--fg-muted)]">
                    No significant layout thrashing detected.
                  </p>
                )}
              </div>
            )}
            {report.developerHints?.reactRerenders && (
              <div className="mt-2">
                <ReactRerendersSection
                  data={report.developerHints.reactRerenders}
                  durationSec={durationSec}
                  formatNumber={formatNumber}
                />
              </div>
            )}
          </div>
        </details>
      )}

      <details className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">
          Bottleneck suggestions
        </summary>
        <div className="mt-3 space-y-2 text-sm text-[var(--fg-muted)]">
          {report.suggestions.length === 0 ? (
            <p>No major bottlenecks detected in this session.</p>
          ) : (
            report.suggestions.map((suggestion) => (
              <div
                key={suggestion.title}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
              >
                <p className="font-medium text-[var(--fg)]">
                  {suggestion.title}
                </p>
                <p className="text-[var(--fg-muted)]">{suggestion.detail}</p>
              </div>
            ))
          )}
        </div>
      </details>

      <details className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">
          Long tasks & network requests
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
              <ListChecks className="h-4 w-4 text-[var(--accent)]" />
              Long tasks ({report.longTasks.count})
            </div>
            <div className="space-y-2 text-sm text-[var(--fg-muted)]">
              <p>Total time: {formatNumber(report.longTasks.totalTimeMs)}ms</p>
              {report.longTasks.topTasks.length === 0 ? (
                <p>No long tasks captured.</p>
              ) : (
                report.longTasks.topTasks.map((task, i) => (
                  <div key={`task-${i}-${task.name}-${task.startSec}`}>
                    {task.name} — {formatNumber(task.durationMs)}ms at{" "}
                    {formatNumber(task.startSec)}s
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-xs text-[var(--fg-muted)]">
              <thead className="sticky top-0 bg-[var(--bg)] text-[11px] uppercase text-[var(--fg-muted)]">
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
                  report.networkRequests.map((request, i) => (
                    <tr
                      key={`req-${i}-${request.url}`}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-2">
                        <p
                          className="truncate text-[var(--fg)]"
                          title={request.url}
                        >
                          {request.method} {request.url}
                        </p>
                        <p className="text-[11px] text-[var(--fg-muted)]">
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

      <details className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">
          Visual spike frames
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {report.spikeFrames.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              No spike frames captured yet. Run a longer session to capture
              frames.
            </p>
          ) : (
            report.spikeFrames.map((frame, i) => (
              <button
                type="button"
                key={`spike-${i}-${frame.timeSec}`}
                onClick={() => {
                  setSpikeModalFrame(frame);
                  setReportTimeSec(frame.timeSec);
                }}
                className="cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-left transition hover:border-[var(--accent)]/50 hover:ring-2 hover:ring-[var(--accent)]/30"
              >
                <img
                  src={frame.imageDataUrl}
                  alt={`Spike at ${frame.timeSec.toFixed(1)}s`}
                  className="h-36 w-full object-cover"
                />
                <div className="px-3 py-2 text-xs text-[var(--fg-muted)]">
                  {frame.timeSec.toFixed(1)}s · {Math.round(frame.fps)} FPS —
                  click to open
                </div>
              </button>
            ))
          )}
        </div>
      </details>

      {spikeModalFrame && (
        <SpikeFrameModal
          report={report}
          frame={spikeModalFrame}
          currentTimeSec={reportTimeSec}
          onTimeChange={setReportTimeSec}
          onClose={() => setSpikeModalFrame(null)}
        />
      )}
      {graphModal && (
        <GraphModal
          title={graphModal.title}
          unit={graphModal.unit}
          data={graphModal.data}
          report={report}
          onClose={() => setGraphModal(null)}
        />
      )}

      <details className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">
          Recording video
        </summary>
        <div className="mt-4 space-y-3">
          {report.video ? (
            <>
              <video
                ref={videoRef}
                controls
                preload="metadata"
                className="w-full rounded-lg border border-[var(--border)]"
                src={report.video.url}
                onLoadedMetadata={() => {
                  if (videoRef.current && reportTimeSec > 0) {
                    videoRef.current.currentTime = reportTimeSec;
                  }
                }}
              />
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3">
                <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
                  Timeline (0 — {durationSec.toFixed(1)}s)
                </p>
                <SessionTimeline
                  durationSec={durationSec}
                  currentTimeSec={reportTimeSec}
                  onTimeChange={setReportTimeSec}
                  showLabels={true}
                />
              </div>
              {report.spikeFrames.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-[var(--fg-muted)]">
                  {report.spikeFrames.map((frame, i) => (
                    <button
                      key={`jump-${i}-${frame.timeSec}`}
                      type="button"
                      onClick={() => {
                        setReportTimeSec(frame.timeSec);
                        const v = videoRef.current;
                        if (v) {
                          v.currentTime = frame.timeSec;
                          v.play().catch(() => undefined);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 hover:border-[var(--accent)]/50 hover:bg-[var(--accent-dim)]"
                    >
                      <PlayCircle className="h-3 w-3 text-[var(--accent)]" />
                      Jump to {frame.timeSec.toFixed(1)}s
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              Video recording is unavailable for this session.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

export default memo(ReportViewer);
