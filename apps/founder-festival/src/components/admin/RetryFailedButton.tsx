"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Re-runs ONLY the failed items of THIS run, in place (resets them to the queue
// and re-opens the job). The run's successful results stay. Confirms first since
// it spends real money, then refreshes so the live progress + counts update.
export function RetryFailedButton({ jobId, failedCount }: { jobId: string; failedCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    const n = failedCount;
    if (
      !window.confirm(
        `Re-run ${n} failed scan${n === 1 ? "" : "s"} in this run? This re-attempts ` +
          `just the failures (fresh Exa + Claude) and spends real money. The run's ` +
          `successful results are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/retry-failed`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        setBusy(false);
      } else {
        const json = await res.json().catch(() => ({}));
        alert(
          json.error === "insufficient_credits"
            ? "Not enough credits to re-run these scans."
            : json.error || `Re-run failed (HTTP ${res.status})`,
        );
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
      onClick={retry}
      disabled={busy}
      className="shrink-0 rounded-md border border-amber-500/40 px-3 py-1.5 text-sm text-amber-400 hover:border-amber-500 hover:text-amber-300 disabled:opacity-40"
    >
      {busy ? "Re-running…" : `Re-run failed (${failedCount})`}
    </button>
  );
}
