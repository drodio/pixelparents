"use client";

import { Suspense } from "react";
// useSignIn from /legacy gives the stable SignInResource with
// authenticateWithRedirect. The default @clerk/nextjs hook returns the
// Future API where signIn.sso() is half-implemented (doesn't actually
// navigate).
import { useSignIn } from "@clerk/nextjs/legacy";
// useUser/useClerk are the same shape across the default and legacy hooks —
// pull them from the default entry (mirrors ClaimProfileModal).
import { useUser, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { setClaimEvalCookie } from "@/lib/claim-cookie";

function ClaimContent() {
  const { signIn } = useSignIn();
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const params = useSearchParams();
  const e = params.get("e");
  const denied = params.get("denied");
  const redirectCallbackUrl = `/claim/callback${e ? `?e=${e}` : ""}`;
  // Put the eval id on the sso-callback URL so it can FORCE the post-auth
  // redirect (the dashboard default "/" wins over redirectUrlComplete during
  // the sign-up transfer for users new to Clerk — see SsoCallback).
  const ssoCallbackUrl = `/claim/sso-callback${e ? `?e=${e}&return=welcome` : ""}`;
  // Where an ALREADY-signed-in user goes: straight to the callback to run the
  // claim match with their current identity (skipping a fresh sign-in), or to
  // /welcome when there's no eval to claim.
  const signedInDest = e ? `/claim/callback?e=${e}&return=welcome` : "/welcome";

  async function go(strategy: "oauth_linkedin_oidc" | "oauth_github" | "email_link") {
    if (!signIn) return;
    if (strategy === "email_link") {
      alert("Email flow coming soon — use LinkedIn or GitHub.");
      return;
    }
    // Cookie backstop so the eval id survives the OAuth round-trip even if
    // Clerk drops the ?e= query param (see src/lib/claim-cookie.ts).
    if (e) setClaimEvalCookie(e);
    // Clerk is single-session: calling authenticateWithRedirect while already
    // signed in is rejected server-side with err_code=authorization_invalid and
    // dumps the user on a raw JSON error page at clerk.festival.so. Skip the
    // fresh sign-in entirely for signed-in users (mirrors ClaimProfileModal).
    if (isSignedIn) {
      window.location.href = signedInDest;
      return;
    }
    // Preventive cleanup: clear any half-complete OAuth state cookies from a
    // prior attempt that didn't finish, which otherwise fail Clerk's callback
    // state validation with the same authorization_invalid error. signOut() is
    // a no-op when no session exists.
    try {
      await clerk.signOut();
    } catch {
      // best-effort cookie cleanup
    }
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: ssoCallbackUrl,
        redirectUrlComplete: redirectCallbackUrl,
      });
    } catch (err) {
      // isSignedIn can lag during Clerk's initial load; if the session was in
      // fact still active, fall through to the direct-callback redirect. Match
      // the client-SDK message ("already signed in"), the session_exists code,
      // AND authorization_invalid — the actual server-side single-session
      // rejection code this whole guard exists to avoid.
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { errors?: Array<{ code?: string }> } | undefined)?.errors?.[0]?.code;
      if (
        msg.toLowerCase().includes("already signed in") ||
        code === "session_exists" ||
        code === "authorization_invalid"
      ) {
        window.location.href = signedInDest;
        return;
      }
      throw err;
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-12 gap-8 text-center">
      <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
        Verify it&apos;s actually you.
      </h1>
      <p className="text-zinc-400 max-w-md text-sm">
        Choose how you&apos;d like to confirm your identity. We&apos;ll match
        against the profile you entered.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={() => go("oauth_linkedin_oidc")}
          className="rounded-md bg-white text-black font-medium py-3"
        >
          Continue with LinkedIn
        </button>
        <button
          onClick={() => go("oauth_github")}
          className="rounded-md border border-zinc-700 text-zinc-100 py-3"
        >
          Continue with GitHub
        </button>
        <button
          onClick={() => go("email_link")}
          className="rounded-md border border-zinc-700 text-zinc-100 py-3 opacity-60"
        >
          Continue with email (soon)
        </button>
      </div>
      {denied && (
        <p className="text-sm text-red-400 max-w-md mt-2">
          We couldn&apos;t confirm you&apos;re this person. Try another method.
        </p>
      )}
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimContent />
    </Suspense>
  );
}
