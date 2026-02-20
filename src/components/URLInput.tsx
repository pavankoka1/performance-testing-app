"use client";

import { Globe } from "lucide-react";
import { memo } from "react";

type URLInputProps = {
  value: string;
  onChange: (value: string) => void;
};

function URLInput({ value, onChange }: URLInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        className="text-sm font-medium text-[var(--fg)]"
        htmlFor="target-url"
      >
        Target URL
      </label>
      <div className="relative">
        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
        <input
          id="target-url"
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://example.com"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-3 pl-10 pr-4 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)]/60 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
        />
      </div>
      <p className="text-xs text-[var(--fg-muted)]">
        Any http(s) URL — we’ll record Web Vitals, FPS, CPU, and more.
      </p>
    </div>
  );
}

export default memo(URLInput);
