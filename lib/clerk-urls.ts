// Where Clerk should send people for sign-in / sign-up, per host.
//
// WHY THIS EXISTS AS ITS OWN MODULE
//
// Clerk's Account Portal (accounts.<domain>) is NOT provisioned for this
// instance: accounts.gopixel.org returns 404 and accounts.pixelparents.org
// returns 403. Whenever `signInUrl` / `signUpUrl` are left undefined on
// ClerkProvider, Clerk silently falls back to that portal — so a missing prop
// doesn't fail loudly, it just routes real users to a dead page. That is exactly
// how login broke: `signUpUrl` was never set (every "Sign up" link died) and
// `signInUrl` was only set on the satellite (so Clerk-initiated sign-in
// redirects on gopixel.org died too).
//
// The app hosts its own /sign-in and /sign-up, so every Clerk URL must point
// back here. Centralised + unit-tested so the invariant "never undefined, never
// accounts.*" can't quietly regress again, and so the ClerkProvider (layout) and
// the middleware (proxy.ts) can't drift apart.

export const PRIMARY_ORIGIN = "https://gopixel.org";

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";

// The satellite must use ABSOLUTE primary URLs — a relative path would keep the
// user on the satellite host, where the cross-domain handshake can't complete.
// The primary uses relative paths so it works on preview deployments too.
export function clerkAuthUrls(isSatellite: boolean): {
  signInUrl: string;
  signUpUrl: string;
} {
  return isSatellite
    ? {
        signInUrl: `${PRIMARY_ORIGIN}${SIGN_IN_PATH}`,
        signUpUrl: `${PRIMARY_ORIGIN}${SIGN_UP_PATH}`,
      }
    : { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH };
}

// The hosts this deployment serves as the Clerk SATELLITE. Everything else is
// the primary. Shared so the layout and proxy.ts can never disagree about which
// host is which.
export function isSatelliteHost(host: string | null | undefined): boolean {
  const h = (host ?? "").toLowerCase().split(":")[0];
  return h === "pixelparents.org" || h === "www.pixelparents.org";
}
