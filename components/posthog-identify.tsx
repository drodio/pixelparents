"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";

// Ties PostHog events to the signed-in ACCOUNT. Rendered inside the (authed)
// ClerkProvider, so useUser() has context here (ClerkProvider is scoped to the
// (authed) route group, not the root layout — which is also why this lives here
// and not in the root PostHogProvider).
//
// Privacy:
//   - Signed IN  → identify by the stable Clerk user id, so a person's actions
//     are grouped under their account. We deliberately send NO PII (no email /
//     name) to the analytics store — the id alone ties actions to the account,
//     and some accounts are minors.
//   - Signed OUT → posthog.reset() clears any prior identity so the visitor is
//     anonymous. "Only non-signed-in users should not have identities."
//
// No-op without a key (posthog is never initialized by the root provider then).
const POSTHOG_ENABLED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);

export function PostHogIdentify() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!POSTHOG_ENABLED || !isLoaded || typeof window === "undefined") return;
    if (isSignedIn && user) {
      // Re-identify is cheap + idempotent; only re-runs when the id changes.
      if (posthog.get_distinct_id() !== user.id) {
        posthog.identify(user.id);
      }
    } else {
      // Clear identity on sign-out so the next visitor isn't attributed to the
      // previous account. reset() is a no-op if already anonymous.
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
