"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPencil, IconTrash, IconCircleCheck } from "@/components/icons";
import { deleteAskAction, setAskResolvedAction } from "../actions";

// Creator-only management bar for an Community post: edit (link to the edit page),
// mark resolved / reopen (toggles status), and delete (behind a confirm dialog).
// All three server actions re-check authorship server-side; this is just the UI.
export function PostControls({
  id,
  resolved,
}: {
  id: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleResolved = () => {
    setError(null);
    startTransition(async () => {
      const res = await setAskResolvedAction({ id, resolved: !resolved });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  const confirmDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteAskAction({ id });
      if (res.ok) {
        router.push("/community");
        router.refresh();
      } else {
        setError(res.error);
        setConfirming(false);
      }
    });
  };

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/community/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/75 transition hover:bg-white/5"
        >
          <IconPencil className="h-4 w-4" /> Edit
        </Link>

        <button
          type="button"
          onClick={toggleResolved}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 px-3 py-1.5 text-sm text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-50"
        >
          <IconCircleCheck className="h-4 w-4" />
          {resolved ? "Reopen" : "Mark resolved"}
        </button>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 px-3 py-1.5 text-sm text-red-200 transition hover:bg-red-400/10 disabled:opacity-50"
        >
          <IconTrash className="h-4 w-4" /> Delete
        </button>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-4"
        >
          <p className="text-sm text-white/85">Delete this post? This can&apos;t be undone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              className="rounded-full bg-red-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-red-300 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
