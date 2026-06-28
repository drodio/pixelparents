"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoringModel } from "@/lib/admin";

// "Re-Run All" — re-scores every profile via one scoring job (each item
// re-scored in place by the worker via reEvaluate). Lives in the jobs-table
// header, above the per-row Re-run buttons. Confirms first since it spends real
// money. Cost preview uses the tuned per-profile estimate (cents) passed per
// model, so the dialog reflects the chosen model without a round-trip.
export function RescoreAllButton({
  count,
  centsPerProfile,
}: {
  count: number;
  centsPerProfile: Record<ScoringModel, number>;
}) {
  const router = useRouter();
  const [model, setModel] = useState<ScoringModel>("sonnet");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (count === 0) {
      alert("No profiles to re-score yet.");
      return;
    }
    const estUsd = `$${((count * centsPerProfile[model]) / 100).toFixed(2)}`;
    const modelLabel = model === "opus" ? "Opus" : "Sonnet";
    if (
      !window.confirm(
        `Re-score all ${count} profile${count === 1 ? "" : "s"} with ${modelLabel}? ` +
          `This re-scores every profile from scratch (fresh Exa + Claude) and ` +
          `spends real money — about ${estUsd}.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rescore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.jobId) {
        router.push(`/admin/profiles/${json.jobId}`);
      } else {
        alert(json.error || `Re-run all failed (HTTP ${res.status})`);
        setBusy(false);
      }
    } catch {
      alert("Re-run all failed: network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={model}
        onChange={(e) => setModel(e.target.value as ScoringModel)}
        disabled={busy}
        aria-label="Model for re-scoring all profiles"
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 normal-case"
      >
        <option value="sonnet">Sonnet</option>
        <option value="opus">Opus</option>
      </select>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 normal-case"
      >
        {busy ? "Starting…" : "Re-Run All"}
      </button>
    </div>
  );
}
