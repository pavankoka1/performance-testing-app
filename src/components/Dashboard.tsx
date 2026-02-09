"use client";

import { useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { Activity, ShieldCheck } from "lucide-react";
import URLInput from "./URLInput";
import RecordButtons from "./RecordButtons";
import ReportViewer from "./ReportViewer";
import type { PerfReport } from "@/lib/reportTypes";

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
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<PerfReport | null>(null);

  const handleStart = async () => {
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
        body: JSON.stringify({ action: "start", url }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to start recording.");
      }
      toast.success("Recording started. Browser window is ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start recording.";
      toast.error(message);
      setIsRecording(false);
    }
  };

  const handleStop = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to stop recording.");
      }
      setReport(data.report as PerfReport);
      toast.success("Trace processed. Report ready.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to stop recording.";
      toast.error(message);
    } finally {
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Toaster position="top-right" />
      <header className="border-b border-white/10 bg-[#121212]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">
              PerfTrace
            </p>
            <h1 className="text-3xl font-semibold text-gradient">PerfTrace</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck className="h-4 w-4 text-indigo-300" />
            Chromium + Playwright ready
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="rounded-2xl border border-white/10 bg-[#1E1E1E]/90 p-6 shadow-[0_0_24px_rgba(138,43,226,0.2)]">
          <div className="flex flex-col gap-6">
            <URLInput value={url} onChange={setUrl} />
            <RecordButtons
              isRecording={isRecording}
              isProcessing={isProcessing}
              onStart={handleStart}
              onStop={handleStop}
            />
            <div className="flex items-center gap-3 text-sm text-white/70">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isRecording ? "bg-emerald-400" : "bg-white/30"
                }`}
              />
              {isRecording ? (
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 animate-pulse text-emerald-300" />
                  Recording in progress...
                </span>
              ) : isProcessing ? (
                "Processing trace and generating report..."
              ) : (
                "Idle - launch a session to begin."
              )}
            </div>
          </div>
        </section>

        <ReportViewer report={report} />
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
