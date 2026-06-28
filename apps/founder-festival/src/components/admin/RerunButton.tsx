"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Re-runs an entire job — CLONES it into a new run (the original stays as
// history) and navigates to the NEW run's page, where (on localhost) the
// progress view auto-drives the worker. Confirms first since it spends money.
export function RerunButton({ jobId, totalItems }: { jobId: string; totalItems: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function rerun(e: React.MouseEvent) {
    e.preventDefault(); // row link wraps this; don't navigate to the job twice
    e.stopPropagation();
    const n = totalItems;
    if (
      !window.confirm(
        `Re-run all ${n} item${n === 1 ? "" : "s"} as a NEW run? This re-scores ` +
          `every item from scratch (fresh Exa + Claude) and spends real money. ` +
          `The original run is kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`, { method: "POST" });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        router.push(`/admin/profiles/${json.jobId ?? jobId}`);
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error || `Re-run failed (HTTP ${res.status})`);
        setBusy(false);
      }
    } catch {
      alert("Re-run failed: network error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={rerun}
      disabled={busy}
      className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40"
    >
      {busy ? "Re-running…" : "Re-run"}
    </button>
  );
}
