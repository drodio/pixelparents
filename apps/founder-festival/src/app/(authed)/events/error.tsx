"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Error boundary for the public event pages (/events/[slug] and its apply flow).
export default function EventsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h2 className="text-xl font-semibold text-zinc-100">This page couldn&rsquo;t load</h2>
      <p className="max-w-md text-zinc-400">
        We hit an unexpected error and have been notified. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full border border-[#dfa43a] px-5 py-1.5 text-[#dfa43a] transition hover:bg-[#dfa43a]/10"
      >
        Try again
      </button>
    </div>
  );
}
