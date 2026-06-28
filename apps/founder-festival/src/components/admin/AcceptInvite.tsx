"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";

type Status =
  | { kind: "redeeming" }
  | { kind: "success"; roleName: string | null; invitedByEmail: string }
  | { kind: "error"; code: string; invitedEmail?: string };

// Drives the whole admin-invite acceptance UX.
//
//   - Signed OUT → open Clerk's SIGN-UP modal (invitees are usually new), with
//     both the sign-up and sign-in redirects pointing back at THIS page (token
//     preserved) so the redeem fires automatically once they're authenticated.
//     "Already have an account? Sign in" inside the modal still works.
//   - Signed IN  → POST the token to the redeem API once and render the outcome.
//     Single-use: the back button re-firing just yields "already_redeemed".
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const [status, setStatus] = useState<Status>({ kind: "redeeming" });
  const redeemedRef = useRef(false);
  const openedRef = useRef(false);

  // Where Clerk should send the user back to after auth — same page, same
  // token, so the redeem effect below runs with a live session.
  const redirectUrl = `/admin/accept-invite?token=${encodeURIComponent(token)}`;

  const openAuth = () =>
    clerk.openSignUp({
      forceRedirectUrl: redirectUrl,
      signInForceRedirectUrl: redirectUrl,
      fallbackRedirectUrl: redirectUrl,
    });

  // Signed out → auto-open the sign-up modal once Clerk has loaded.
  useEffect(() => {
    if (isLoaded && !isSignedIn && !openedRef.current) {
      openedRef.current = true;
      openAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Signed in → redeem once.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || redeemedRef.current) return;
    redeemedRef.current = true;
    let cancelled = false;
    async function go() {
      try {
        const res = await fetch("/api/admin/invites/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          roleName?: string | null;
          invitedByEmail?: string;
          invitedEmail?: string;
        };
        if (cancelled) return;
        if (res.ok && json.ok) {
          setStatus({
            kind: "success",
            roleName: json.roleName ?? null,
            invitedByEmail: json.invitedByEmail ?? "the inviter",
          });
        } else {
          setStatus({
            kind: "error",
            code: json.error ?? "unknown",
            invitedEmail: json.invitedEmail,
          });
        }
      } catch {
        if (!cancelled) setStatus({ kind: "error", code: "network" });
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, token]);

  return (
    <div className="max-w-md mx-auto mt-20 px-6 flex flex-col gap-4 text-center">
      <h1 className="font-display text-2xl font-bold">Admin invitation</h1>

      {/* Signed out: prompt to create an account (or sign in) to accept. */}
      {isLoaded && !isSignedIn && (
        <div className="flex flex-col gap-4">
          <p className="text-zinc-400 text-sm">
            You&apos;ve been invited to be an admin on Festival. Create your
            account to accept — use the email address your invite was sent to.
          </p>
          <button
            type="button"
            onClick={openAuth}
            className="self-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-medium px-4 py-2 text-sm"
          >
            Sign up to accept
          </button>
          <p className="text-zinc-500 text-xs">
            Already have an account? Use &ldquo;Sign in&rdquo; inside that window.
          </p>
        </div>
      )}

      {!isLoaded && <p className="text-zinc-400 text-sm">Loading…</p>}

      {isLoaded && isSignedIn && status.kind === "redeeming" && (
        <p className="text-zinc-400 text-sm">Validating your invitation…</p>
      )}

      {status.kind === "success" && (
        <div className="flex flex-col gap-4">
          <p className="text-emerald-400 text-sm">
            ✓ You&apos;re now an admin on Festival
            {status.roleName ? ` (${status.roleName})` : " (full access)"}.
          </p>
          <p className="text-zinc-400 text-xs">
            Invitation accepted from {status.invitedByEmail}.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="self-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-medium px-4 py-2 text-sm"
          >
            Enter Admin Area
          </button>
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex flex-col gap-2">
          {status.code === "email_mismatch" ? (
            <>
              <p className="text-red-400 text-sm">
                This invitation was sent to{" "}
                <strong>{status.invitedEmail ?? "another address"}</strong>, but
                you&apos;re signed in with a different account.
              </p>
              <p className="text-zinc-500 text-xs">
                Sign out and sign back in with the invited email to accept.
              </p>
            </>
          ) : status.code === "expired" ? (
            <p className="text-red-400 text-sm">
              This invitation has expired. Ask for a new one.
            </p>
          ) : status.code === "already_redeemed" ? (
            <p className="text-zinc-400 text-sm">
              This invitation has already been accepted. If you think this is a
              mistake, ask the inviter to send a new one.
            </p>
          ) : status.code === "not_found" ? (
            <p className="text-red-400 text-sm">
              We couldn&apos;t find that invitation. Double-check the link from
              your email or ask for a new one.
            </p>
          ) : (
            <p className="text-red-400 text-sm">
              Something went wrong validating your invitation
              {status.code === "network" ? " (network)" : ""}. Try again, or
              ask the inviter to resend.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
