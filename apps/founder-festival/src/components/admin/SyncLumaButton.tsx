"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PreviewData = {
  events: number;
  guests: number;
  toScore: number;
  estimatedCents: number;
  willCharge: boolean;
};

// Admin button that pulls the Luma calendar's events into our events table,
// then refreshes the list so the new rows show up. Before running the real sync,
// a preview call shows how many new profiles would be scored and the estimated
// cost, so the admin can confirm before credits are charged.
export function SyncLumaButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  async function handleClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/events/sync-luma/preview", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ? `Preview failed: ${j.error}` : "Preview failed");
        return;
      }
      setPreview(j as PreviewData);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSync() {
    setPreview(null);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/events/sync-luma", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.status === 402 && j.error === "insufficient_credits") {
        setMsg(
          `Synced, but you don't have enough credits to score ${j.neededCents != null ? Math.ceil(j.neededCents / 13) : "new"} profiles — top up at /admin/credits.`,
        );
        router.refresh();
        return;
      }
      if (!res.ok) {
        setMsg(j.error ? `Sync failed: ${j.error}` : "Sync failed");
        return;
      }
      const scoredPart =
        j.scored > 0
          ? `; scoring ${j.scored} new profile${j.scored === 1 ? "" : "s"} in the background`
          : "";
      setMsg(`Synced ${j.synced} event${j.synced === 1 ? "" : "s"} from Luma${scoredPart}.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  function cancelSync() {
    setPreview(null);
  }

  const confirmLabel = preview && preview.toScore > 0 ? "Sync & Score" : "Sync";

  return (
    <>
      <div className="flex items-center gap-3">
        {msg && <span className="text-xs text-zinc-400">{msg}</span>}
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="rounded-md border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-white px-4 py-2 text-sm disabled:opacity-40"
        >
          {busy ? "Loading…" : "Sync from Luma"}
        </button>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={cancelSync}
        >
          <div
            role="dialog"
            aria-label="Confirm Luma sync"
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-[#161616] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold text-zinc-100">Confirm Luma Sync</h2>
            <p className="mb-2 text-sm text-zinc-300">
              Sync {preview.events} event{preview.events === 1 ? "" : "s"} and {preview.guests}{" "}
              guest{preview.guests === 1 ? "" : "s"} from Luma.
            </p>
            {preview.toScore > 0 && (
              <p className="mb-2 text-sm text-zinc-300">
                {preview.toScore} new profile{preview.toScore === 1 ? "" : "s"} will be scored.
                {preview.willCharge ? (
                  <span className="text-amber-400">
                    {" "}~${(preview.estimatedCents / 100).toFixed(2)} will be charged to you.
                  </span>
                ) : (
                  <span className="text-emerald-400"> No charge (super-admin).</span>
                )}
              </p>
            )}
            {preview.toScore === 0 && (
              <p className="mb-2 text-sm text-zinc-500">No new profiles to score.</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelSync}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSync}
                className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
