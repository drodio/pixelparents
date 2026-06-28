"use client";

import { useAuth, SignUpButton } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BTN =
  "rounded-full bg-[#dfa43a] px-4 py-1.5 text-sm font-semibold text-[#151515] transition hover:bg-[#e8b557] disabled:opacity-60";

// Lightweight changelog subscribe. A Clerk account is all that's needed — the
// user never has to claim a profile. After sign-up we bounce back to
// /changelog?subscribe=1 and auto-record the subscription.
export function ChangelogSubscribe({ subscribed: initial }: { subscribed: boolean }) {
  const { isSignedIn, isLoaded } = useAuth();
  const [subscribed, setSubscribed] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/changelog/subscribe", { method: "POST" });
      if (res.ok) setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  // Returning from the sign-up modal redirect (?subscribe=1) → auto-subscribe,
  // then tidy the URL. The state writes happen asynchronously after the fetch,
  // which is the intended post-redirect side effect.
  useEffect(() => {
    if (isLoaded && isSignedIn && params.get("subscribe") === "1" && !subscribed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      subscribe().then(() => router.replace("/changelog"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <span>✓ Subscribed</span>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/changelog/subscribe", { method: "DELETE" });
            setSubscribed(false);
          }}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          unsubscribe
        </button>
      </div>
    );
  }

  if (!isLoaded) return <div className="h-8" />;

  if (isSignedIn) {
    return (
      <button type="button" onClick={subscribe} disabled={busy} className={BTN}>
        {busy ? "…" : "Subscribe"}
      </button>
    );
  }

  return (
    <SignUpButton
      mode="modal"
      forceRedirectUrl="/changelog?subscribe=1"
      signInForceRedirectUrl="/changelog?subscribe=1"
    >
      <button type="button" className={BTN} title="Create a free account to get notified — no profile needed">
        Subscribe
      </button>
    </SignUpButton>
  );
}
