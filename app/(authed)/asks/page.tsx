import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import { hasDatabase } from "@/lib/db";
import { listOpenAsks } from "@/lib/db/asks";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight, IconSparkles } from "@/components/icons";
import { AsksBoardClient } from "./asks-board-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Asks — Pixel Parents",
  description: "Ask the Stanford OHS community for help — matched to people with the right expertise.",
  robots: { index: false, follow: false },
};

function PageHeader() {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Asks</h1>
        <p className="mt-1 text-sm text-white/55">
          Ask the OHS community for help — we&apos;ll suggest people with the right expertise.
        </p>
      </div>
    </header>
  );
}

export default async function AsksPage() {
  // Signed-out → grayed shell + sign-in CTA, BEFORE any DB read (no PII loaded).
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

  // Gate: only VERIFIED OHS families see the board (the surface is for the
  // verified community). Unverified / non-family → a prompt to verify/join.
  if (!isVerified) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">Verify to use Asks</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            {viewerSignup
              ? "Confirm your OHS student's Stanford email to post asks and offer help to the community."
              : "Your account isn't recognized as an OHS family yet. Join Pixel Parents to use the asks board."}
          </p>
          <Link
            href={viewerSignup ? "/verify" : "/signup"}
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            {viewerSignup ? "Verify now" : "Join Pixel Parents"}
          </Link>
        </div>
      </>,
    );
  }

  if (!hasDatabase()) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
          Asks aren&apos;t available yet — check back soon.
        </div>
      </>,
    );
  }

  const openAsks = await listOpenAsks();

  return shell(
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Asks</h1>
          <p className="mt-1 text-sm text-white/55">
            Ask the OHS community for help — we&apos;ll suggest people with the right expertise.
          </p>
        </div>
        <Link
          href="/asks/new"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          <IconSparkles className="h-4 w-4" />
          Post an ask
        </Link>
      </header>

      {openAsks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-white/60">No open asks yet.</p>
          <Link
            href="/asks/new"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 hover:text-amber-200"
          >
            Be the first to post one <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <Suspense fallback={null}>
          <AsksBoardClient
            asks={openAsks.map((a) => ({
              id: a.id,
              title: a.title,
              body: a.body,
              tags: a.expertiseTags ?? [],
              createdAt: (a.createdAt instanceof Date
                ? a.createdAt
                : new Date(a.createdAt as unknown as string)
              ).toISOString(),
            }))}
          />
        </Suspense>
      )}
    </>,
  );
}
