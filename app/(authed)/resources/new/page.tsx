import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import { hasDatabase } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight } from "@/components/icons";
import { NewBoardForm } from "./new-board-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a board — GoPixel",
  robots: { index: false, follow: false },
};

export default async function NewBoardPage() {
  const viewer = await currentUser();
  if (!viewer) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="resources" />
      </DashboardShell>
    );
  }
  const email = primaryEmail(viewer);
  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const firstName = viewerSignup?.firstName ?? viewer.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;
  const isVerified = Boolean(viewerSignup) && isFamilyVerified(viewerSignup!);

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  if (!isVerified || !hasDatabase()) {
    return shell(
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
        Only verified OHS families can create boards.{" "}
        <Link href="/resources" className="text-amber-300 hover:text-amber-200">
          Back to boards
        </Link>
      </div>,
    );
  }

  return shell(
    <div className="mx-auto max-w-2xl">
      <Link
        href="/resources"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
      >
        <IconArrowRight className="h-4 w-4 rotate-180" />
        Back to boards
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create a board</h1>
        <p className="mt-1 text-sm text-white/55">
          A board is a permanent, community-curated collection on a theme. Give it a clear title
          and a short description — we&apos;ll auto-label it with topic tags so others can find it.
        </p>
      </header>
      <NewBoardForm />
    </div>,
  );
}
