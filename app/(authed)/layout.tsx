import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getFamilyForEmail } from "@/lib/db/signups";
import { verifiedEmailsOf } from "@/lib/verify";

// ClerkProvider is scoped to this route group (mirrors founder-festival) so the
// public coming-soon splash never loads Clerk JS or triggers the dev-instance
// handshake redirect. Clerk only boots on /sign-in and /admin, which live here.
//
// Route groups don't change URLs: app/(authed)/admin -> /admin,
// app/(authed)/sign-in -> /sign-in. The proxy.ts matcher protects /admin only,
// leaving /sign-in publicly reachable while still inside the provider.

// Forced verification gate (flag FAMILY_FORCE_VERIFY, default off). When the flag
// is "true", an authed user who HAS a signup but whose family has ZERO verified
// students is bounced to /verify?required=1 from anywhere in (authed). Admins are
// exempt; we skip when already on /verify so the gate can't loop. Flag off → this
// whole block is skipped and behavior is identical to today. Best-effort: any
// failure (no DB, lookup error) falls through to rendering rather than locking
// users out.
async function enforceVerificationGate(): Promise<void> {
  if (process.env.FAMILY_FORCE_VERIFY !== "true") return;

  // Current path comes from the x-pathname request header set by proxy.ts (a
  // layout can't read the pathname directly). Skip gating when already on /verify
  // so we never redirect-loop, and only act on real navigations (header present).
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!pathname || pathname === "/verify" || pathname.startsWith("/verify/")) return;

  try {
    const viewer = await currentUser();
    const email = primaryEmail(viewer);
    // Not signed in → nothing to gate here (route-level auth handles protected
    // pages; public (authed) pages like /sign-in stay open).
    if (!email) return;

    // Admins are exempt from the gate.
    if (await isAdminEmail(email)) return;

    // Resolve the caller's family. No signup on file → not a Pixel Parents family
    // yet, so there's nothing to force-verify here (the /verify page itself
    // handles the "no signup" messaging). Only gate users who HAVE a signup.
    const family = await getFamilyForEmail(email);
    if (!family) return;

    // Family-wide verified emails: union across every parent in the family. A
    // family is considered verified if ANY member carries a verified student
    // email (mirrors the family-wide approval model).
    const hasVerified = family.members.some(
      (m) => verifiedEmailsOf((m.extra ?? {}) as Record<string, unknown>).length > 0,
    );
    if (!hasVerified) redirect("/verify?required=1");
  } catch (err) {
    // redirect() throws a control-flow signal (NEXT_REDIRECT) — never swallow it.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("enforceVerificationGate failed:", err);
  }
}

export default async function AuthedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await enforceVerificationGate();
  // Theme every Clerk surface under this provider (sign-in, UserButton popover,
  // "Manage account" modal) with the shared dark/amber appearance so Clerk's
  // default light UI never leaks through. The verification gate above is
  // unaffected — appearance is purely presentational.
  return <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>;
}
