"use client";

import { useState } from "react";
// IMPORTANT: useSignIn from /legacy gives the stable SignInResource with
// authenticateWithRedirect + prepareFirstFactor. The default @clerk/nextjs
// hook returns the new "Future" API where signIn.sso() is half-implemented.
// useUser and useClerk are the same shape in both — pull them from default.
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { useUser, useClerk } from "@clerk/nextjs";
import { setClaimEvalCookie } from "@/lib/claim-cookie";

type Props = {
  open: boolean;
  onClose: () => void;
  evaluationId: string;
  initialBanner?: {
    kind: "claim_failed";
    provider: "github" | "email";
  } | null;
  // First name from the eval. When present the modal header personalizes to
  // "{firstName}, claim your profile" instead of the generic "Claim Your Profile".
  firstName?: string | null;
};

export function ClaimProfileModal({ open, onClose, evaluationId, initialBanner, firstName }: Props) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { isSignedIn } = useUser();
  const clerk = useClerk();
  const [step, setStep] = useState<"providers" | "email-entry" | "email-sent">("providers");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  // If the user already has an active Clerk session, skip the OAuth handshake
  // and route them straight to /claim/callback — it reads the existing
  // session, runs matchConfidence, and redirects appropriately. This handles
  // the "You're already signed in" 400 from Clerk when retrying after a
  // failed attempt or on a different eval.
  const claimUrl = `/claim/callback?e=${evaluationId}&return=welcome`;

  async function goSso(strategy: "oauth_linkedin_oidc" | "oauth_github") {
    if (!signIn) return;
    // Stash the claim target in a cookie that survives Clerk's OAuth round-trip
    // even if the ?e= query param is dropped — /claim/callback + the home page
    // recover it from here so the user lands on their profile, not home.
    setClaimEvalCookie(evaluationId);
    if (isSignedIn) {
      window.location.href = claimUrl;
      return;
    }
    // Preventive cleanup: clear any half-complete OAuth state cookies from a
    // prior attempt that didn't finish (e.g., user closed the LinkedIn tab
    // mid-flow). Without this, Clerk's server-side OAuth callback can fail
    // state validation with `err_code=authorization_invalid` and bounce the
    // user to a raw JSON error page on clerk.festival.so. clerk.signOut() is
    // a no-op when no session exists; otherwise it clears session cookies.
    try {
      await clerk.signOut();
    } catch {
      // ignore — best-effort cookie cleanup
    }
    // useUser().isSignedIn can lag during Clerk's initial load. Wrap the call
    // so that the "You're already signed in" error falls through to the
    // direct-callback redirect — same behavior as the pre-flight check.
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        // Carry the eval id + return on the sso-callback URL itself so that
        // page can FORCE the post-auth redirect back to /claim/callback. The
        // redirectUrlComplete below is only a backup — Clerk drops it during
        // the sign-up transfer for users new to Clerk, which is exactly when
        // the dashboard default ("/") would otherwise send them home.
        redirectUrl: `/claim/sso-callback?e=${evaluationId}&return=welcome`,
        redirectUrlComplete: claimUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { errors?: Array<{ code?: string }> } | undefined)?.errors?.[0]?.code;
      if (msg.toLowerCase().includes("already signed in") || code === "session_exists") {
        window.location.href = claimUrl;
        return;
      }
      throw err;
    }
  }

  async function startEmailLink() {
    if (!signIn || !email) return;
    setEmailErr(null);
    setEmailBusy(true);
    const redirectUrl = `${window.location.origin}/claim/sso-callback?e=${evaluationId}&return=welcome`;
    try {
      // Pre-check: would this email actually verify the claimant as the
      // subject? An email only works if it equals the profile's public email
      // OR its domain matches the company domain + the name matches. Reject a
      // non-matching email (e.g. a personal gmail) up front — before creating
      // any Clerk account — so the user isn't stranded with a dead sign-in.
      try {
        const res = await fetch("/api/claim/email-eligible", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ e: evaluationId, email: email.trim() }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.eligible) {
          setEmailErr(
            "That email can’t verify you for this profile. Use your company " +
              "email (matching the company on the profile), or claim with " +
              "LinkedIn or GitHub instead.",
          );
          return;
        }
      } catch {
        setEmailErr("Couldn’t check that email — try again, or use LinkedIn / GitHub.");
        return;
      }

      // Eligible — stash the claim target cookie (survives the email round-trip).
      setClaimEvalCookie(evaluationId);
      if (isSignedIn) {
        window.location.href = claimUrl;
        return;
      }
      // Preventive cleanup before a fresh attempt (clears stale state cookies).
      try {
        await clerk.signOut();
      } catch {
        // ignore
      }

      // Try sign-IN first (existing Clerk account). If Clerk doesn't know this
      // email, fall back to sign-UP — otherwise first-time claimers hit
      // "Couldn't find your account" and can never claim.
      try {
        const created = await signIn.create({ identifier: email });
        const emailFactor = created.supportedFirstFactors?.find(
          (f: { strategy?: string }) => f.strategy === "email_link",
        ) as { strategy: "email_link"; emailAddressId: string } | undefined;
        if (!emailFactor?.emailAddressId) {
          throw new Error("Email link auth isn't enabled on this Clerk instance.");
        }
        await signIn.prepareFirstFactor({
          strategy: "email_link",
          emailAddressId: emailFactor.emailAddressId,
          redirectUrl,
        });
        setStep("email-sent");
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { errors?: Array<{ code?: string }> } | undefined)?.errors?.[0]?.code;
        if (msg.toLowerCase().includes("already signed in") || code === "session_exists") {
          window.location.href = claimUrl;
          return;
        }
        const notFound =
          code === "form_identifier_not_found" ||
          msg.toLowerCase().includes("couldn't find") ||
          msg.toLowerCase().includes("could not find") ||
          msg.toLowerCase().includes("not found");
        if (!notFound) throw err;
        // Fall through to sign-up below.
      }

      // Sign-UP path for first-time claimers: create the account with this
      // email and send a verification link. After they click it, the
      // sso-callback completes the sign-up and /claim/callback runs the match.
      if (!signUp) throw new Error("Sign-up isn't available right now.");
      await signUp.create({ emailAddress: email.trim() });
      await signUp.prepareEmailAddressVerification({
        strategy: "email_link",
        redirectUrl,
      });
      setStep("email-sent");
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : "Could not send link.");
    } finally {
      setEmailBusy(false);
    }
  }

  // Escape hatch when the existing session is the wrong account (e.g.,
  // signed in as work-google but wants to claim via personal LinkedIn).
  async function signOutAndReset() {
    setSwitchingAccount(true);
    try {
      await clerk.signOut();
      // No reload needed — useUser() flips isSignedIn to false, and the
      // next provider click will run the full authenticateWithRedirect.
    } finally {
      setSwitchingAccount(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1c1c1c] border border-zinc-800 rounded-lg max-w-md w-full p-6 sm:p-8 flex flex-col gap-6 text-zinc-100"
      >
        <div className="flex justify-between items-center">
          <h2 className="font-display text-2xl font-bold">
            {firstName ? `${firstName}, claim your profile` : "Claim Your Profile"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {initialBanner?.kind === "claim_failed" && step === "providers" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            We couldn&apos;t confirm you own this profile via{" "}
            <strong>{initialBanner.provider === "github" ? "GitHub" : "email"}</strong>.
            Try LinkedIn instead.
          </div>
        )}

        {step === "providers" && (
          <>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Before we show you events and allow you to score and tune your
              needs, we need to verify that you&apos;re the person we scored.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sign in below. We&apos;ll match the account against the LinkedIn
              profile we evaluated.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => goSso("oauth_linkedin_oidc")}
                className={`rounded-md font-medium py-3 transition-opacity ${
                  initialBanner?.kind === "claim_failed"
                    ? "bg-[#dfa43a] text-black hover:opacity-90"
                    : "bg-white text-black hover:opacity-90"
                }`}
              >
                Continue with LinkedIn
              </button>
              <button
                onClick={() => goSso("oauth_github")}
                className={`rounded-md border py-3 transition-colors ${
                  initialBanner?.kind === "claim_failed"
                    ? "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    : "border-zinc-700 text-zinc-100 hover:border-zinc-500"
                }`}
              >
                Continue with GitHub
              </button>
              <button
                onClick={() => setStep("email-entry")}
                className={`rounded-md border py-3 transition-colors ${
                  initialBanner?.kind === "claim_failed"
                    ? "border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    : "border-zinc-700 text-zinc-100 hover:border-zinc-500"
                }`}
              >
                Continue with email
              </button>
            </div>
            {isSignedIn && (
              <button
                type="button"
                onClick={signOutAndReset}
                disabled={switchingAccount}
                className="text-xs text-zinc-500 hover:text-zinc-300 self-center disabled:opacity-40"
              >
                {switchingAccount ? "Signing out…" : "Use a different account"}
              </button>
            )}
          </>
        )}

        {step === "email-entry" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startEmailLink();
            }}
            className="flex flex-col gap-3"
          >
            <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Email
            </label>
            <input
              autoFocus
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={emailBusy || email.trim() === ""}
              className="rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
            >
              {emailBusy ? "Sending…" : "Send sign-in link"}
            </button>
            <button
              type="button"
              onClick={() => setStep("providers")}
              className="text-xs text-zinc-500 hover:text-zinc-300 self-center"
            >
              ← Back to providers
            </button>
            {emailErr && <div className="text-sm text-red-400 text-center">{emailErr}</div>}
          </form>
        )}

        {step === "email-sent" && (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-base text-zinc-200">
              Check <strong>{email}</strong> for a sign-in link.
            </p>
            <p className="text-xs text-zinc-500">
              The link will sign you in and verify your identity in one step.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
