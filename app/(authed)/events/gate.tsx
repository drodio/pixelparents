import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import type { SignupRow } from "@/lib/db/schema/signups";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";

// Shared verified-family gate for the events sub-pages (new / edit / detail).
// Returns either a ready-to-render gated element (signed-out, or not verified) or
// the resolved verified viewer so the page can proceed. Mirrors the Community
// gate so the surfaces behave identically.
export type GateResult =
  | { gated: React.ReactElement }
  | {
      gated: null;
      viewer: SignupRow;
      email: string | null;
      firstName: string | null;
      status: ApprovalStatus | null;
      isAdmin: boolean;
    };

export async function gateEvents(): Promise<GateResult> {
  const user = await currentUser();
  if (!user) {
    return {
      gated: (
        <DashboardShell authed={false} firstName={null} email={null} status={null}>
          <SignedOutPanel area="community" />
        </DashboardShell>
      ),
    };
  }
  const email = primaryEmail(user);
  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const firstName = viewerSignup?.firstName ?? user.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;
  const isVerified = Boolean(viewerSignup) && isFamilyVerified(viewerSignup!);

  if (!isVerified) {
    return {
      gated: (
        <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <h2 className="text-lg font-semibold">Verify to use Events</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
              {viewerSignup
                ? "Confirm your OHS student's Stanford email to create and manage events."
                : "Join Pixel Parents to use Events."}
            </p>
            <Link
              href={viewerSignup ? "/verify" : "/signup"}
              className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              {viewerSignup ? "Verify now" : "Join Pixel Parents"}
            </Link>
          </div>
        </DashboardShell>
      ),
    };
  }

  return {
    gated: null,
    viewer: viewerSignup!,
    email,
    firstName,
    status,
    isAdmin,
  };
}
