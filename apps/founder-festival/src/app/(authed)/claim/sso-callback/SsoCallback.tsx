"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

// Completes the OAuth/email-link handshake, then forwards to `dest`
// (always /claim/callback?e=<id>…). We pass `dest` as BOTH the sign-in and
// sign-up *force* redirect URLs on purpose:
//
//   • A Clerk dashboard-level "after sign-up" default URL otherwise wins for
//     people who are NEW to Clerk. The OAuth "transfer" from sign-in → sign-up
//     drops the `redirectUrlComplete` passed to authenticateWithRedirect, so
//     the dashboard default ("/") takes over and the user lands on the home
//     page instead of back on their profile.
//   • `*ForceRedirectUrl` beats the dashboard default, so the claim always
//     returns to /claim/callback regardless of sign-in vs. sign-up.
export function SsoCallback({ dest }: { dest: string }) {
  return (
    <AuthenticateWithRedirectCallback
      signInForceRedirectUrl={dest}
      signUpForceRedirectUrl={dest}
    />
  );
}
