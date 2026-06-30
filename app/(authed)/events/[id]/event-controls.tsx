"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPencil, IconTrash } from "@/components/icons";
import { deleteEventAction } from "../actions";

// Author/admin-only edit + delete controls for a user event. Delete is behind a
// confirm step. Authorization is re-checked server-side in the actions.
export function EventControls({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteEventAction({ id: eventId });
      if (res.ok) {
        router.push("/events");
        router.refresh();
      } else {
        setError(res.error);
        setConfirming(false);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={`/events/${eventId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          <IconPencil className="h-4 w-4" /> Edit
        </Link>
        {confirming ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="rounded-full bg-red-500/90 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-medium text-red-300/90 transition hover:bg-red-500/10"
          >
            <IconTrash className="h-4 w-4" /> Delete
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
