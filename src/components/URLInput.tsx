"use client";

import { Globe } from "lucide-react";

type URLInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function URLInput({ value, onChange }: URLInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-white/80" htmlFor="target-url">
        Target URL
      </label>
      <div className="relative">
        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        <input
          id="target-url"
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://example-game.com"
          className="w-full rounded-lg border border-white/10 bg-base-900/80 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:ring-indigo-400"
        />
      </div>
      <p className="text-xs text-white/50">
        Paste a playable URL (Canvas, WebGL, or CSS animations).
      </p>
    </div>
  );
}
