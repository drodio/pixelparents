import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { clerkAuthUrls, isSatelliteHost } from "@/lib/clerk-urls";

// Round 6: the signup form creates the member's Clerk account (email +
// password) as part of signing up, so /signup needs a ClerkProvider of its
// own — the app-wide provider is scoped to (authed) precisely so the public
// splash never boots Clerk JS, and /signup sits outside that group. Scoping a
// second provider here keeps the splash clean while giving the signup flow
// (and the /signup/thanks wizard under it) a working useSignUp()/useAuth().
//
// The multi-domain config MUST mirror app/(authed)/layout.tsx and proxy.ts:
// one deployment serves the Clerk primary (gopixel.org) and the satellite
// (pixelparents.org), and signInUrl/signUpUrl are pinned on both hosts because
// Clerk's fallback Account Portal is not provisioned for this instance (see
// lib/clerk-urls.ts, unit-tested).
export default async function SignupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const host = (await headers()).get("host");
  const isSatellite = isSatelliteHost(host);
  const { signInUrl, signUpUrl } = clerkAuthUrls(isSatellite);
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      isSatellite={isSatellite}
      domain={isSatellite ? "pixelparents.org" : undefined}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
    >
      {children}
    </ClerkProvider>
  );
}
