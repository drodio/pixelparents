import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// The admin area and the developer /account page are gated (sensitive: admin
// tools + API-key management). The public coming-soon splash and the public
// /developers docs stay open and never boot Clerk JS (ClerkProvider is scoped to
// the (authed) route group, not the root layout — see app/(authed)/layout.tsx).
//
// /family, /dashboard, and /community are intentionally NOT hard-redirected:
// signed-out visitors land IN the grayed dashboard shell (locked tabs + sign-in
// CTA) and the page itself loads ZERO DB/PII before the auth check, so no family
// or community data is ever exposed without a session.
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/account(.*)"]);

// Multi-domain (Clerk): this ONE deployment serves the Clerk PRIMARY
// (pixelparents.org) and the SATELLITE (gopixel.org). On the satellite host we flip
// Clerk into satellite mode (its FAPI is clerk.gopixel.org) and point sign-in at the
// primary, so the cross-domain handshake runs instead of gopixel.org being treated
// as its own primary. On the primary host these are unset → behavior is byte-for-byte
// unchanged. Kept in lockstep with the same conditional on <ClerkProvider> (see
// app/(authed)/layout.tsx). Domains are public config, not secrets.
const PRIMARY_SIGN_IN_URL = "https://pixelparents.org/sign-in";
function isSatelliteHost(host: string | null): boolean {
  const h = (host ?? "").toLowerCase();
  return h === "gopixel.org" || h === "www.gopixel.org";
}

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
      // Redirects unauthenticated visitors to the sign-in page.
      await auth.protect();
    }
    // Expose the request pathname to server components via a request header so the
    // (authed) layout can skip-gate the current route (Next layouts can't read the
    // pathname directly). Additive + harmless — when the FAMILY_FORCE_VERIFY flag
    // is off the layout never reads it. This is a REQUEST header (not sent to the
    // client), set on the forwarded request only.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", req.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  },
  (req) =>
    isSatelliteHost(req.headers.get("host"))
      ? { isSatellite: true, domain: "gopixel.org", signInUrl: PRIMARY_SIGN_IN_URL }
      : {},
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
