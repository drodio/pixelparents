import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified, expertiseSignalsOf } from "@/lib/directory";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight } from "@/components/icons";
import { PostAskForm } from "./post-ask-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post an ask — Pixel Parents",
  robots: { index: false, follow: false },
};

export default async function NewAskPage() {
  const viewer = await currentUser();
  if (!viewer) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="community" />
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

  if (!isVerified) {
    return shell(
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <h2 className="text-lg font-semibold">Verify to post an ask</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          {viewerSignup
            ? "Confirm your OHS student's Stanford email to post asks."
            : "Join Pixel Parents to post asks."}
        </p>
        <Link
          href={viewerSignup ? "/verify" : "/signup"}
          className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          {viewerSignup ? "Verify now" : "Join Pixel Parents"}
        </Link>
      </div>,
    );
  }

  // Suggest the asker's own expertise signals as quick-add tags — these are the
  // same tags the matcher uses, so it primes a useful tag set.
  const suggestedTags = expertiseSignalsOf(viewerSignup!).slice(0, 12);

  return shell(
    <>
      <header className="mb-8">
        <Link
          href="/asks"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to asks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Post an ask</h1>
        <p className="mt-1 text-sm text-white/55">
          Tell the community what you need — and tag the expertise that would help.
        </p>
      </header>
      <PostAskForm suggestedTags={suggestedTags} />
    </>,
  );
}
