"use client";

import { Play, Square } from "lucide-react";
import { memo } from "react";

type RecordButtonsProps = {
  isRecording: boolean;
  isProcessing: boolean;
  onStart: () => void;
  onStop: () => void;
};

function RecordButtons({
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
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-[var(--glow)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        Launch & Start Recording
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!isRecording || isProcessing}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-6 py-3 text-sm font-semibold text-[var(--fg)] transition hover:border-[var(--fg-muted)]/30 hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Square className="h-4 w-4" />
        Stop Recording & Generate Report
      </button>
    </div>
  );
}

export default memo(RecordButtons);
