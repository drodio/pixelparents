"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PerEvalCents } from "./NewJobForm";
import { DateTimePickerModal } from "./DateTimePickerModal";

type Source = "web" | "bulk" | "api";
const SOURCES: { key: Source; label: string }[] = [
  { key: "web", label: "Web" },
  { key: "bulk", label: "Bulk" },
  { key: "api", label: "API" },
];

// Hard ceiling on top-N before the server rejects with 400. Mirrors
// TOP_PROFILES_MAX in profiles-scored.ts so the UI gates client-side too.
const TOP_PROFILES_MAX = 10_000;

type Criterion = "date" | "topN";

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// "Re-Score Existing" job builder. Operator picks a criterion (a "scored
// before" cutoff OR a "top N by combined score" slice), the sources
// (web/bulk/api), and a model; the server counts matching profiles +
// estimates cost; Create queues a job that re-scores them in place.
export function StaleRescoreForm({ perEvalCents }: { perEvalCents: PerEvalCents }) {
  const router = useRouter();
  const [criterion, setCriterion] = useState<Criterion>("date");
  const [model, setModel] = useState<"sonnet" | "opus">("sonnet");
  const [notScoredSince, setNotScoredSince] = useState(""); // datetime-local
  const [topN, setTopN] = useState<string>(""); // free text → coerced to int
  const [sources, setSources] = useState<Record<Source, boolean>>({ web: true, bulk: true, api: true });
  const [preview, setPreview] = useState<{ count: number; estimatedCents: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = SOURCES.map((s) => s.key).filter((k) => sources[k]);

  // Build the staleFilter payload for whichever criterion is active. Returns
  // null if the active criterion is not yet usable (missing/invalid input).
  function staleFilterBody(
    c: Criterion,
    since: string,
    n: string,
    srcs: string[],
  ): Record<string, unknown> | null {
    if (c === "date") {
      if (!since) return null;
      const d = new Date(since);
      if (Number.isNaN(d.getTime())) return null;
      return { notScoredSince: d.toISOString(), sources: srcs };
    }
    const parsed = Number(n);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const clamped = Math.min(Math.trunc(parsed), TOP_PROFILES_MAX);
    return { topN: clamped, sources: srcs };
  }

  // Re-fetch live count + est cost. Called from every control so there's no
  // effect (and no setState-in-effect lint trap).
  async function refreshPreview(next?: {
    criterion?: Criterion;
    since?: string;
    topN?: string;
    srcs?: Record<Source, boolean>;
    mdl?: "sonnet" | "opus";
  }) {
    const c = next?.criterion ?? criterion;
    const since = next?.since ?? notScoredSince;
    const n = next?.topN ?? topN;
    const srcs = next?.srcs ?? sources;
    const mdl = next?.mdl ?? model;
    const chosen = SOURCES.map((s) => s.key).filter((k) => srcs[k]);
    setError(null);
    if (chosen.length === 0) {
      setPreview(null);
      return;
    }
    const sf = staleFilterBody(c, since, n, chosen);
    if (!sf) {
      setPreview(null);
      return;
    }
    setPreviewBusy(true);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: mdl, dryRun: true, staleFilter: sf }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Preview failed");
        setPreview(null);
      } else {
        setPreview({ count: json.count, estimatedCents: json.estimatedCents });
      }
    } catch {
      setError("Network error");
      setPreview(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (criterion === "date" && !notScoredSince) return setError("Pick a date/time");
    if (criterion === "topN") {
      const n = Number(topN);
      if (!Number.isFinite(n) || n <= 0) return setError("Enter a positive number");
      if (n > TOP_PROFILES_MAX) return setError(`Max is ${TOP_PROFILES_MAX.toLocaleString("en-US")}`);
    }
    if (selected.length === 0) return setError("Select at least one source");
    const sf = staleFilterBody(criterion, notScoredSince, topN, selected);
    if (!sf) return setError("Couldn't read the criterion");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, dryRun: false, staleFilter: sf }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create job");
        setBusy(false);
        return;
      }
      router.push(`/admin/profiles/${json.jobId}`);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Criterion</label>
        <div className="flex gap-3">
          {(["date", "topN"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCriterion(c);
                void refreshPreview({ criterion: c });
              }}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                criterion === c
                  ? "border-white text-white bg-zinc-800"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {c === "date" ? "Scored before date" : "Top N by score"}
            </button>
          ))}
        </div>
      </div>

      {criterion === "date" ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Scored before:</label>
          <DateTimePickerModal
            value={notScoredSince}
            onChange={(v) => {
              setNotScoredSince(v);
              void refreshPreview({ since: v });
            }}
          />
          <p className="text-xs text-zinc-500">
            Re-scores every successful profile (score &gt; 0) last scored on or before this date &amp; time.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-zinc-200">
          <span>Top</span>
          <input
            type="number"
            min={1}
            max={TOP_PROFILES_MAX}
            step={1}
            value={topN}
            onChange={(e) => {
              setTopN(e.target.value);
              void refreshPreview({ topN: e.target.value });
            }}
            className="w-24 rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm tabular-nums outline-none focus:border-zinc-600"
          />
          <span>by score</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Sources</label>
        <div className="flex gap-4">
          {SOURCES.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sources[s.key]}
                onChange={(e) => {
                  const next = { ...sources, [s.key]: e.target.checked };
                  setSources(next);
                  void refreshPreview({ srcs: next });
                }}
                className="accent-white"
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Model</label>
        <div className="flex gap-3">
          {(["sonnet", "opus"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setModel(m);
                void refreshPreview({ mdl: m });
              }}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                model === m ? "border-white text-white bg-zinc-800" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {m === "sonnet" ? "Sonnet 4.6" : "Opus 4.7"} (~{fmt(perEvalCents[m])}/eval)
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Profiles matched:</span>
          <span className="tabular-nums">{previewBusy ? "…" : preview ? preview.count.toLocaleString("en-US") : "—"}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-800 pt-2 mt-1">
          <span className="text-zinc-300">Estimated total:</span>
          <span className="font-bold tabular-nums">
            {previewBusy ? "…" : preview ? fmt(preview.estimatedCents) : "—"}
          </span>
        </div>
      </div>

      {error && <div className="text-sm text-red-400 whitespace-pre-wrap">{error}</div>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || !preview || preview.count === 0}
          className="rounded-md bg-white text-black font-medium px-6 py-3 disabled:opacity-40"
        >
          {busy ? "Creating…" : preview ? `Re-score ${preview.count.toLocaleString("en-US")} profile${preview.count === 1 ? "" : "s"}` : "Re-Score Existing"}
        </button>
        <a
          href="/admin"
          className="rounded-md border border-zinc-800 hover:border-zinc-600 px-6 py-3 text-zinc-400 hover:text-white text-sm self-center"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
