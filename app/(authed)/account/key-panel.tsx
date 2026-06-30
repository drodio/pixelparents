"use client";

import { useState } from "react";
import { regenerateKey, revealKey } from "./actions";
import { IconSparkles } from "@/components/icons";

export function KeyPanel({ hasKey, prefix }: { hasKey: boolean; prefix: string | null }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<{ error?: string; raw?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r.error) setError(r.error);
      else if (r.raw) setRaw(r.raw);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* visible to copy manually */
    }
  }

  // Freshly generated / regenerated — show the raw key exactly once.
  if (raw) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5">
        <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
          Here&apos;s your API key <IconSparkles className="h-4 w-4" />
        </p>
        <p className="text-sm text-white/70">
          Save it now — it won&apos;t be shown again. If you lose it, use Regenerate.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90">
            {raw}
          </code>
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  // Already has a key (revealed earlier) — can only regenerate.
  if (hasKey) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/70">
          Your key{" "}
          {prefix && <code className="font-mono text-xs text-white/90">{prefix}…</code>} is active.
          For security the full value is only shown once, at creation.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(regenerateKey)}
          className="self-start rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
        >
          {busy ? "Working…" : "Regenerate key"}
        </button>
        <p className="text-xs text-white/40">
          Regenerating invalidates the old key immediately.
        </p>
      </div>
    );
  }

  // Approved but no key yet — first reveal.
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/70">
        Your access is approved. Generate your API key to start building.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => run(revealKey)}
        className="self-start rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {busy ? "Generating…" : "Generate my API key"}
      </button>
    </div>
  );
}
