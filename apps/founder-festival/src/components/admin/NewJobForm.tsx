"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parsePasteInput } from "@/lib/parse-paste-input";
import { parseCsvRows, type CsvRow } from "@/lib/csv-to-lines";
import { StaleRescoreForm } from "./StaleRescoreForm";

type Estimate = {
  rows: number;
  invalid: number;
  perEvalCents: number;
  resolveCents: number;
  needsResolve: number;
  totalCents: number;
};

// Tuned per-model per-eval cents (median of recent actuals, computed
// server-side by getEstimateCents) and the resolve fallback, passed in as props
// so the preview matches what the server will actually estimate.
export type PerEvalCents = { sonnet: number; opus: number };

// Use the shared parser so the client preview matches what the server will
// actually queue. Handles line-based input AND messy YC-paste input
// (multi-line entries with "Founder at" anchors).
function estimate(
  input: string,
  model: "sonnet" | "opus",
  perEvalCents: PerEvalCents,
  resolveCents: number,
): Estimate {
  const parsed = parsePasteInput(input);
  let rows = 0;
  let invalid = 0;
  let needsResolve = 0;
  for (const p of parsed) {
    if (p.kind === "invalid") invalid++;
    else if (p.kind === "url") rows++;
    else {
      rows++;
      needsResolve++;
    }
  }
  const perEval = perEvalCents[model];
  const resolve = needsResolve * resolveCents;
  return {
    rows,
    invalid,
    perEvalCents: perEval,
    resolveCents: resolve,
    needsResolve,
    totalCents: rows * perEval + resolve,
  };
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function NewJobForm({
  perEvalCents,
  resolveCents,
}: {
  perEvalCents: PerEvalCents;
  resolveCents: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "stale">("paste");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState<"sonnet" | "opus">("sonnet");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown (with a mailto) when the input can't be parsed into any usable rows.
  const [cantProcess, setCantProcess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  // Structured CSV rows are held separately (NOT collapsed into the textarea) so
  // their email + location survive to the server.
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const est = useMemo(() => {
    const base = estimate(input, model, perEvalCents, resolveCents);
    if (csvRows.length === 0) return base;
    const csvName = csvRows.filter((r) => !r.linkedinUrl).length;
    const rows = base.rows + csvRows.length;
    const needsResolve = base.needsResolve + csvName;
    const resolve = needsResolve * resolveCents;
    return { ...base, rows, needsResolve, resolveCents: resolve, totalCents: rows * base.perEvalCents + resolve };
  }, [input, model, perEvalCents, resolveCents, csvRows]);

  // Convert a dropped/chosen CSV into the textarea's line format and append it,
  // so the existing parse/estimate/submit flow is unchanged.
  async function ingestCsv(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const isCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel";
    if (!isCsv) {
      setError("Please drop a .csv file");
      return;
    }
    try {
      const rows = parseCsvRows(await file.text());
      if (rows.length === 0) {
        setError(`No names or LinkedIn URLs found in ${file.name}`);
        return;
      }
      setCsvRows((prev) => [...prev, ...rows]);
      setError(null);
      const withEmail = rows.filter((r) => r.email).length;
      const withLoc = rows.filter((r) => r.city || r.region || r.country || r.locationRaw).length;
      const extras = [
        withEmail ? `${withEmail} with email` : "",
        withLoc ? `${withLoc} with location` : "",
      ].filter(Boolean).join(", ");
      setCsvNote(
        `Added ${rows.length} row${rows.length === 1 ? "" : "s"} from ${file.name}${extras ? ` (${extras})` : ""}`,
      );
    } catch {
      setError(`Couldn't read ${file.name}`);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    void ingestCsv(e.dataTransfer.files);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCantProcess(false);
    if (est.rows === 0) {
      setCantProcess(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, model, input, rows: csvRows }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Couldn't parse the input into any usable rows → friendly help message.
        if (json.error === "no valid lines in input") setCantProcess(true);
        else setError(json.error || "Failed to create job");
        setBusy(false);
        return;
      }
      // Existing profiles are now ENRICHED (not skipped). Tell the operator how
      // the upload split so the row count isn't surprising.
      if (typeof json.enrichedExisting === "number" && json.enrichedExisting > 0) {
        alert(
          `${json.totalItems} total: ${json.scored} new to score, ` +
            `${json.enrichedExisting} existing enriched in place (email/location added). ` +
            `Download the enriched CSV from the job page once scoring finishes.`,
        );
      }
      router.push(`/admin/profiles/${json.jobId}`);
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3">
        {(["paste", "stale"] as const).map((md) => (
          <button
            key={md}
            type="button"
            onClick={() => setMode(md)}
            className={`rounded-md border px-4 py-2 text-sm transition-colors ${
              mode === md
                ? "border-white text-white bg-zinc-800"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {md === "paste" ? "Paste a list" : "Re-Score Existing"}
          </button>
        ))}
      </div>

      {mode === "stale" ? (
        <StaleRescoreForm perEvalCents={perEvalCents} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. YC W25 founders test"
          className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Model</label>
        <div className="flex gap-3">
          {(["sonnet", "opus"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                model === m
                  ? "border-white text-white bg-zinc-800"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {m === "sonnet" ? "Sonnet 4.6" : "Opus 4.7"} (~{fmt(perEvalCents[m])}/eval)
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Paste or Upload
          </label>
          <div className="flex items-center gap-3">
            {/* Gold link + gold-outline pill, mirroring the leaderboard control. */}
            <a
              href="/founder-festival-csv-template.csv"
              download="Founder Festival CSV Template.csv"
              className="link text-xs"
            >
              Sample CSV
            </a>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-[#dfa43a]/60 text-[#dfa43a] hover:bg-[#dfa43a]/10 px-3 py-0.5 text-xs transition-colors"
            >
              Upload CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void ingestCsv(e.target.files);
                e.target.value = ""; // allow re-selecting the same file
              }}
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Lines starting with <span className="font-mono">#</span> are treated as comments.
        </p>
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          className={`relative rounded-md ${dragging ? "ring-2 ring-emerald-500" : ""}`}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={14}
            placeholder={"Flexible formatting — a few things work:\n• One LinkedIn URL per line (linkedin.com/in/janed)\n• Name  or  Name, Company  (one per line)\n\n…or drag a CSV into this box — messy is fine; use the Sample CSV above as a guide"}
            className="w-full rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600 resize-y"
          />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/70 text-sm text-emerald-300">
              Drop CSV to add rows
            </div>
          )}
        </div>
        {csvNote && <p className="text-xs text-emerald-400">{csvNote}</p>}
      </div>

      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">Valid rows:</span>
          <span className="tabular-nums">{est.rows}</span>
        </div>
        {est.invalid > 0 && (
          <div className="flex justify-between text-amber-400">
            <span>Invalid lines (skipped):</span>
            <span className="tabular-nums">{est.invalid}</span>
          </div>
        )}
        <div className="flex justify-between text-zinc-500">
          <span>Scoring (Claude):</span>
          <span className="tabular-nums">
            {est.rows} × {fmt(est.perEvalCents)} = {fmt(est.rows * est.perEvalCents)}
          </span>
        </div>
        {est.needsResolve > 0 && (
          <div className="flex justify-between text-zinc-500">
            <span>Handle resolution (Exa):</span>
            <span className="tabular-nums">
              {est.needsResolve} × {fmt(resolveCents)} = {fmt(est.resolveCents)}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-800 pt-2 mt-1">
          <span className="text-zinc-300">Estimated total:</span>
          <span className="font-bold tabular-nums">{fmt(est.totalCents)}</span>
        </div>
      </div>

      {cantProcess && (
        <div className="text-sm text-red-400">
          I wasn&apos;t able to process that CSV. Please send it to{" "}
          <a
            className="underline hover:text-red-300"
            href={`mailto:DROdio@Festival.so?subject=${encodeURIComponent("CSV won't process")}`}
          >
            DROdio@Festival.so
          </a>{" "}
          to troubleshoot.
        </div>
      )}
      {error && <div className="text-sm text-red-400">{error}</div>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || est.rows === 0}
          className="rounded-md bg-white text-black font-medium px-6 py-3 disabled:opacity-40"
        >
          {busy ? "Creating…" : `Queue ${est.rows} subject${est.rows === 1 ? "" : "s"}`}
        </button>
        <a
          href="/admin"
          className="rounded-md border border-zinc-800 hover:border-zinc-600 px-6 py-3 text-zinc-400 hover:text-white text-sm self-center"
        >
          Cancel
        </a>
      </div>
        </form>
      )}
    </div>
  );
}
