"use client";

import { Loader2 } from "lucide-react";
import { memo, useEffect, useState } from "react";

const MESSAGES = [
  "Stopping browser and capturing trace…",
  "Reading performance data from Chromium…",
  "Parsing timeline events (this may take a moment)…",
  "Building your performance report…",
  "Almost there — finalizing metrics…",
  "Analyzing FPS, CPU, and memory…",
  "Generating animation timeline…",
];

function ProcessingLoader() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 2500);
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 92));
    }, 800);
    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/90 py-16 px-8">
      <div className="relative">
        <Loader2
          className="h-16 w-16 animate-spin text-[var(--accent)]"
          strokeWidth={2}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-[var(--fg-muted)]">
            {progress}%
          </span>
        </div>
      </div>
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-[var(--fg)]">
          {MESSAGES[messageIndex]}
        </p>
        <p className="mt-2 text-xs text-[var(--fg-muted)]">
          Longer sessions take more time to process. Hang tight!
        </p>
      </div>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default memo(ProcessingLoader);
