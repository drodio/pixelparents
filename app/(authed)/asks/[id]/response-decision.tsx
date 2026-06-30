"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideResponseAction } from "../actions";

// Accept / decline buttons shown to the ASKER on a pending offer. The action is
// server-authorized (only the asker can decide on their own ask's responses);
// these buttons are just the UI.
export function ResponseDecision({ responseId }: { responseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: "accepted" | "declined") => {
    setError(null);
    startTransition(async () => {
      const res = await decideResponseAction({ responseId, decision });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("accepted")}
        className="rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        Accept
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("declined")}
        className="rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/5 disabled:opacity-50"
      >
        Decline
      </button>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
