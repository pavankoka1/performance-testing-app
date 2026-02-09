"use client";

import { Play, Square } from "lucide-react";

type RecordButtonsProps = {
  isRecording: boolean;
  isProcessing: boolean;
  onStart: () => void;
  onStop: () => void;
};

export default function RecordButtons({
  isRecording,
  isProcessing,
  onStart,
  onStop,
}: RecordButtonsProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <button
        type="button"
        onClick={onStart}
        disabled={isRecording || isProcessing}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[linear-gradient(135deg,_#4B0082,_#8A2BE2)] px-6 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(138,43,226,0.2)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        Launch & Start Recording
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!isRecording || isProcessing}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-[#121212]/70 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Square className="h-4 w-4" />
        Stop Recording & Generate Report
      </button>
    </div>
  );
}
