"use client";

import type { PerfReport } from "@/lib/reportTypes";
import { Activity, Cpu, Layers, ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import LiveMetricsPanel from "./LiveMetricsPanel";
import MetricsGlossary from "./MetricsGlossary";
import ProcessingLoader from "./ProcessingLoader";
import RecordButtons from "./RecordButtons";
import ReportViewer from "./ReportViewer";
import URLInput from "./URLInput";

type CpuThrottle = 1 | 4 | 6;

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export default function Dashboard() {
  const [url, setUrl] = useState("");
  const [cpuThrottle, setCpuThrottle] = useState<CpuThrottle>(1);
  const [trackReactRerenders, setTrackReactRerenders] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<PerfReport | null>(null);

  const handleStart = useCallback(async () => {
    if (!isValidUrl(url)) {
      toast.error("Enter a valid URL starting with http:// or https://");
      return;
    }

    setIsRecording(true);
    setReport(null);

    try {
      const response = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          url,
          cpuThrottle,
          trackReactRerenders,
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to start recording."
        );
      }
      toast.success("Recording started. Browser window is ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start recording.";
      toast.error(message);
      setIsRecording(false);
    }
  }, [url, trackReactRerenders]);

  const handleStop = useCallback(async () => {
    setIsRecording(false);
    setIsProcessing(true);
    try {
      const response = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to stop recording."
        );
      }
      setReport(data.report as PerfReport);
      toast.success("Trace processed. Report ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to stop recording.";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <Toaster
        position="top-right"
        toastOptions={{
          className: "!bg-[var(--bg-elevated)] !border-[var(--border)]",
        }}
      />
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-[var(--fg-muted)]">
              Performance testing
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-gradient sm:text-3xl">
              PerfTrace
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--fg-muted)]">
            <ShieldCheck className="h-4 w-4 text-violet-400" />
            Chromium + Playwright
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--glow)]">
          <div className="flex flex-col gap-6">
            <URLInput value={url} onChange={setUrl} />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
                <Cpu className="h-4 w-4 text-[var(--accent)]" />
                CPU throttling (low-end device simulation)
              </label>
              <select
                value={cpuThrottle}
                onChange={(e) =>
                  setCpuThrottle(Number(e.target.value) as CpuThrottle)
                }
                disabled={isRecording || isProcessing}
                className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2.5 pl-3 pr-8 text-sm text-[var(--fg)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] disabled:opacity-50"
              >
                <option value={1}>1× — No throttling</option>
                <option value={4}>4× — Slower CPU (e.g. low-end mobile)</option>
                <option value={6}>6× — Heavier throttle</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--fg)]">
              <input
                type="checkbox"
                checked={trackReactRerenders}
                onChange={(e) => setTrackReactRerenders(e.target.checked)}
                disabled={isRecording || isProcessing}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <Layers className="h-4 w-4 text-[var(--accent)]" />
              <span>Track React re-renders</span>
              <span className="text-xs text-[var(--fg-muted)]">
                (React apps only, dev build recommended)
              </span>
            </label>
            <RecordButtons
              isRecording={isRecording}
              isProcessing={isProcessing}
              onStart={handleStart}
              onStop={handleStop}
            />
            <div className="flex items-center gap-3 text-sm text-[var(--fg-muted)]">
              <span
                className={`h-2.5 w-2.5 rounded-full shadow-sm ${
                  isRecording
                    ? "bg-emerald-400 shadow-emerald-400/50"
                    : "bg-[var(--fg-muted)]/40"
                }`}
              />
              {isRecording ? (
                <span className="flex items-center gap-2 font-medium text-emerald-400">
                  <Activity className="h-4 w-4 animate-pulse" />
                  Recording in progress…
                </span>
              ) : isProcessing ? (
                "Processing trace and generating report…"
              ) : (
                "Idle — paste a URL and launch to begin."
              )}
            </div>
            {isRecording && <LiveMetricsPanel isRecording={isRecording} />}
          </div>
        </section>

        <MetricsGlossary />

        {isProcessing ? <ProcessingLoader /> : <ReportViewer report={report} />}
      </main>
    </div>
  );
}

const readJsonResponse = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text || "Unexpected response from server." };
  }
};
