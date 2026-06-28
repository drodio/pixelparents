"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";

// The job (list) title with a hover-revealed pencil. Click → inline input;
// Enter / Save → PATCH /api/admin/jobs/[id]; Esc / Cancel → revert. Only
// rendered for run_scoring_jobs-grant viewers (the page gates it).
export function JobTitleEditor({ jobId, initialTitle }: { jobId: string; initialTitle: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const display = (initialTitle ?? "").trim() || "Untitled run";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: value.trim() }),
      });
      if (!res.ok) {
        setError("Couldn't rename");
        setBusy(false);
        return;
      }
      setEditing(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  function cancel() {
    setValue(initialTitle ?? "");
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") cancel();
          }}
          placeholder="Untitled run"
          className="font-display text-2xl sm:text-3xl font-bold tracking-tight bg-black border border-zinc-700 rounded-md px-2 py-1 text-zinc-100 outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-amber-500 text-black px-3 py-1.5 text-sm font-medium hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={cancel} className="text-sm text-zinc-400 hover:text-zinc-200">
          Cancel
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="group mt-1 flex items-center gap-2">
      <h1 className="font-display text-3xl font-bold tracking-tight">{display}</h1>
      <button
        type="button"
        onClick={() => {
          setValue(initialTitle ?? "");
          setEditing(true);
        }}
        aria-label="Rename this list"
        title="Rename this list"
        className="text-zinc-500 hover:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <FiEdit2 className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
