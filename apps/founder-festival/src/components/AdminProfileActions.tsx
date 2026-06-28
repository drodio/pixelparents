"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  evaluationId: string;
  initialHidden: boolean;
};

// Superadmin-only row of profile actions, rendered above the leaderboard/
// re-score pill row on /profile. Visibility is gated server-side; if a
// non-superadmin somehow ended up rendering this component, the server
// would still 403 each API call.
//
// Two affordances:
//   - Hide / Show: toggles evaluations.hidden_at. Hidden profiles drop off
//     the leaderboard but the direct URL still works.
//   - Delete: irreversible. Opens a confirmation modal first.
export function AdminProfileActions({ evaluationId, initialHidden }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initialHidden);
  const [hiding, setHiding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleHide() {
    if (hiding) return;
    const next = !hidden;
    setHiding(true);
    setError(null);
    // Optimistic flip — reverts on error.
    setHidden(next);
    try {
      const res = await fetch(`/api/admin/profile/${evaluationId}/hide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: next }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setHidden(!next);
        setError(data.error ?? "Couldn't update visibility.");
      } else {
        router.refresh();
      }
    } catch {
      setHidden(!next);
      setError("Network error.");
    } finally {
      setHiding(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/profile/${evaluationId}/delete`, {
        method: "POST",
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't delete.");
        setDeleting(false);
        return;
      }
      // Profile is gone — navigate the user away.
      router.push("/leaderboard");
    } catch {
      setError("Network error.");
      setDeleting(false);
    }
  }

  // Rendered inline inside the admin pill (AdminProfileBox), so Hide and Delete
  // are hyperlinks — not pill buttons — with their own " | " separator between
  // them. The pill supplies the separator BEFORE this pair.
  return (
    <>
      <button
        type="button"
        onClick={toggleHide}
        disabled={hiding}
        title={hidden ? "Show on leaderboard" : "Hide from leaderboard"}
        className="link text-xs sm:text-sm cursor-pointer disabled:opacity-40"
      >
        {hidden ? "Show" : "Hide"}
      </button>
      <span className="text-white/20" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={deleting}
        title="Permanently delete this profile"
        className="text-xs sm:text-sm cursor-pointer text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
      >
        Delete
      </button>
      {error && <span className="text-red-400 text-xs ml-1">{error}</span>}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4">
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Delete this profile?</h2>
            <p className="text-sm text-zinc-400 mb-4">
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
                className="rounded-md bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-500 disabled:opacity-60"
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
