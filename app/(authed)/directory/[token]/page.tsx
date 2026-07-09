import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProfileView } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Member profile — GoPixel",
  description: "A GoPixel community member's profile.",
  robots: { index: false, follow: false },
};

// In-dashboard profile view. Clicking a member in the /directory showcase lands
// here — the FULL profile rendered INSIDE the DashboardShell tab (no jump out to
// /p, which would exit the shell). It reuses the shared ProfileView ("dashboard"
// variant); the public /p/<token> route reuses the same component ("public"
// variant) for external/share links.
export default async function CommunityProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Auth + OHS-family gate — identical to the showcase index (/directory).
  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");
  const email = primaryEmail(viewer);
  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const isOhsFamily = Boolean(viewerSignup);
  const firstName = viewerSignup?.firstName ?? viewer.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  if (!isOhsFamily) {
    return shell(
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <h2 className="text-lg font-semibold">This page is for OHS families</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          Your account isn&apos;t recognized as an OHS family yet. Join GoPixel to view member
          profiles.
        </p>
        <Link
          href="/signup"
          className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          Join GoPixel
        </Link>
      </div>,
    );
  }

  // ProfileView is an async server component; it runs its own visibility gate and
  // 404s on an unknown token.
  return shell(<ProfileView token={token} variant="dashboard" />);
}
