"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Segment error boundary for the (authed) area (profile, leaderboard, dashboard,
// account, admin…). Unlike global-error, this keeps the app shell and only
// replaces the page body, so a render crash on one page (e.g. the heavy /profile
// route) shows a recoverable message instead of bubbling to the root boundary.
export default function AuthedError({
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
