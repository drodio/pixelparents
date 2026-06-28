"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Superadmin-only Delete affordance for the floating admin pill (AdminProfileBox,
// top-right of a profile page). Pill-styled to match ScoreDetail / Re-Score.
// Opens a confirmation modal first; on success the profile is gone so we
// navigate away. Visibility is gated server-side; the API also re-checks
// isSuperAdmin and 403s, so rendering this for a non-admin is harmless.
export function AdminDeleteButton({ evaluationId }: { evaluationId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/profile/${evaluationId}/delete`, { method: "POST" });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't delete.");
        setDeleting(false);
        return;
      }
      // Profile is gone — leave the (now-404) page.
      router.push("/leaderboard");
    } catch {
      setError("Network error.");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={deleting}
        title="Permanently delete this profile"
        className="rounded-md border border-red-500/60 px-3 py-0.5 text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="ml-1 text-xs text-red-400">{error}</span>}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-4 max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6">
            <h2 className="mb-2 text-lg font-bold text-zinc-100">Delete this profile?</h2>
            <p className="mb-4 text-sm text-zinc-400">
              All scores, claims, badges, and recommendations will be permanently
              removed. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
