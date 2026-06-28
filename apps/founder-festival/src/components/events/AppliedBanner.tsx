"use client";
import { useEffect, useState } from "react";

type Props = { eventTitle: string };

// Gold one-liner shown on /welcome and /not-this-round after a successful
// event apply. Mirrors the ClaimSuccessBanner pattern: auto-strips its
// query param (applied=<slug>) so a hard refresh doesn't re-trigger the
// banner once it's been dismissed or shown.
export function AppliedBanner({ eventTitle }: Props) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("applied")) {
      url.searchParams.delete("applied");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!show) return null;
  return (
    <div className="w-full max-w-2xl rounded-md border border-[#dfa43a]/60 bg-[#dfa43a]/10 px-4 py-3 text-sm flex items-start gap-3">
      <span className="text-[#dfa43a] font-medium shrink-0">✓</span>
      <div className="flex-1">
        <p className="text-zinc-100">
          <strong>Application received</strong> for {eventTitle}. We&apos;ll be in touch within 48 hours.
        </p>
      </div>
      <button
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="text-zinc-500 hover:text-zinc-300 shrink-0"
      >
        ×
      </button>
    </div>
  );
}
