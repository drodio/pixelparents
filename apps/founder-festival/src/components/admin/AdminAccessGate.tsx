"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

type Status = "none" | "pending" | "denied";

// Shown by the admin layout to anyone who is not (yet) an admin.
//
// The layout passes the SERVER's view (serverSignedIn/email/status from
// currentUser()), but the source of truth for "am I signed in right now" is the
// CLIENT Clerk session (useUser) — the two can disagree right after a modal
// sign-in or when a dev session is stale. We reconcile them here:
//   - client signed OUT        → offer Clerk sign-in (no profile claim).
//   - client signed IN, server NOT synced → refresh once so the layout can
//     re-evaluate admin access (and a Sign-out escape hatch for a stuck session).
//   - client signed IN, server synced (non-admin) → Request Admin Status / status.
// This avoids the old bug where a Sign-in button was shown to an already
// signed-in user, which Clerk rejects with `cannot_render_single_session_enabled`.
export function AdminAccessGate({
  signedIn: serverSignedIn,
  email: serverEmail,
  status,
}: {
  signedIn: boolean;
  email: string | null;
  status: Status;
}) {
  const clerk = useClerk();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState<Status>(status);
  const [error, setError] = useState<string | null>(null);
  const refreshedRef = useRef(false);

  // Desync: the client has a session the server render didn't see (just signed
  // in, or a soft navigation). Re-fetch server components ONCE so the layout
  // re-evaluates with the session cookie. Guarded so a genuinely broken/stale
  // session can't cause a refresh loop — the Sign-out escape hatch covers that.
  useEffect(() => {
    if (isLoaded && isSignedIn && !serverSignedIn && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [isLoaded, isSignedIn, serverSignedIn, router]);

  async function requestAccess() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access/request", { method: "POST" });
      if (!res.ok) {
        setError("Could not submit your request. Please try again.");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { status?: Status };
      setLocalStatus(json.status ?? "pending");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? serverEmail;

  return (
    <div className="w-full max-w-md flex flex-col items-center text-center gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/founder-festival-logo.png"
        alt="Founder Festival"
        width={498}
        height={444}
        className="w-[56px] h-auto"
      />
      <h1 className="font-display text-2xl font-bold tracking-tight">Admin</h1>

      {!isLoaded && <p className="text-zinc-500 text-sm">Loading…</p>}

      {/* Truly signed out → Clerk sign-in (safe: client confirms no session). */}
      {isLoaded && !isSignedIn && (
        <>
          <p className="text-zinc-400 text-sm">Sign in to access the admin area.</p>
          <button
            type="button"
            onClick={() =>
              clerk.openSignIn({
                forceRedirectUrl: "/admin",
                signUpForceRedirectUrl: "/admin",
              })
            }
            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors"
          >
            Sign in
          </button>
        </>
      )}

      {/* Signed in client-side, but the server render hasn't picked up the
          session. We've triggered a refresh; if it's a stale session that the
          server keeps rejecting, the Sign-out escape hatch lets the user reset. */}
      {isLoaded && isSignedIn && !serverSignedIn && (
        <>
          <p className="text-zinc-400 text-sm">Finishing sign-in…</p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors"
          >
            Reload
          </button>
        </>
      )}

      {/* Server agrees the user is signed in, but they're not an admin. */}
      {isLoaded && isSignedIn && serverSignedIn && localStatus === "none" && (
        <>
          <p className="text-zinc-400 text-sm">
            Signed in as <span className="text-zinc-200">{email}</span>, but this
            account isn&apos;t an admin yet.
          </p>
          <button
            type="button"
            disabled={submitting}
            onClick={requestAccess}
            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Requesting…" : "Request Admin Status"}
          </button>
        </>
      )}

      {isLoaded && isSignedIn && serverSignedIn && localStatus === "pending" && (
        <p className="text-sm text-amber-400">
          Your request is pending review. You&apos;ll get access once an admin
          approves it.
        </p>
      )}

      {isLoaded && isSignedIn && serverSignedIn && localStatus === "denied" && (
        <>
          <p className="text-sm text-zinc-400">Your request was declined.</p>
          <button
            type="button"
            disabled={submitting}
            onClick={requestAccess}
            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-medium px-6 py-2.5 text-sm transition-colors disabled:opacity-40"
          >
            {submitting ? "Requesting…" : "Request again"}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Escape hatch: any signed-in state can reset a stuck/wrong session. */}
      {isLoaded && isSignedIn && (
        <button
          type="button"
          onClick={() => clerk.signOut({ redirectUrl: "/admin" })}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
