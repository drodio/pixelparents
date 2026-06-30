import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import { hasDatabase, getDb } from "@/lib/db";
import { listAllAsks } from "@/lib/db/asks";
import { signups } from "@/lib/db/schema/signups";
import { inArray } from "drizzle-orm";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight, IconSparkles } from "@/components/icons";
import { ExchangeBoardClient } from "./exchange-board-client";
import type { AskKind, AskUrgency } from "@/lib/db/asks";
import type { ExchangePost } from "@/lib/exchange";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Exchange — Pixel Parents",
  description:
    "Trade help with the Stanford OHS community — post an Ask or an Offer, matched to people with the right expertise.",
  robots: { index: false, follow: false },
};

function PageHeader() {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Exchange</h1>
        <p className="mt-1 text-sm text-white/55">
          Trade help with the OHS community — post an Ask or an Offer, and we&apos;ll suggest the
          right people.
        </p>
      </div>
    </header>
  );
}

export default async function ExchangePage() {
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

  // Gate: only VERIFIED OHS families see the board.
  if (!isVerified) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">Verify to use the Exchange</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            {viewerSignup
              ? "Confirm your OHS student's Stanford email to post Asks and Offers and respond to the community."
              : "Your account isn't recognized as an OHS family yet. Join Pixel Parents to use the Exchange."}
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
          The Exchange isn&apos;t available yet — check back soon.
        </div>
      </>,
    );
  }

  const rows = await listAllAsks();

  // Resolve author name + member-type for every post in ONE batch query. The
  // author card on the board shows the name + a parent/student badge; we do NOT
  // expose a profile link here (that's gated on the detail page). Names follow
  // the same coarsening as the directory (students: first name only).
  const authorIds = Array.from(new Set(rows.map((r) => r.authorSignupId)));
  const authorById = new Map<string, { name: string; isStudent: boolean }>();
  if (authorIds.length > 0) {
    const authors = await getDb().select().from(signups).where(inArray(signups.id, authorIds));
    for (const a of authors) {
      const student = isStudentAccount(a);
      authorById.set(a.id, {
        name: student ? a.firstName : [a.firstName, a.lastName].filter(Boolean).join(" "),
        isStudent: student,
      });
    }
  }

  const posts: ExchangePost[] = rows.map((r) => {
    const author = authorById.get(r.authorSignupId);
    return {
      id: r.id,
      kind: (r.kind as AskKind) ?? "ask",
      title: r.title,
      body: r.body,
      tags: r.expertiseTags ?? [],
      urgency: (r.urgency as AskUrgency) ?? "normal",
      status: r.status,
      createdAt: (r.createdAt instanceof Date
        ? r.createdAt
        : new Date(r.createdAt as unknown as string)
      ).toISOString(),
      validUntil: r.validUntil
        ? (r.validUntil instanceof Date
            ? r.validUntil
            : new Date(r.validUntil as unknown as string)
          ).toISOString()
        : null,
      authorName: author?.name ?? "A community member",
      isStudent: author?.isStudent ?? false,
    };
  });

  const myPostIds = rows
    .filter((r) => r.authorSignupId === viewerSignup!.id)
    .map((r) => r.id);

  return shell(
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Exchange</h1>
          <p className="mt-1 text-sm text-white/55">
            Trade help with the OHS community — post an Ask or an Offer, and we&apos;ll suggest the
            right people.
          </p>
        </div>
        <Link
          href="/exchange/new"
          className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          <IconSparkles className="h-4 w-4" />
          New post
        </Link>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-white/60">Nothing on the Exchange yet.</p>
          <Link
            href="/exchange/new"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 hover:text-amber-200"
          >
            Be the first to post <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <Suspense fallback={null}>
          <ExchangeBoardClient
            posts={posts}
            myPostIds={myPostIds}
            viewerSignupId={viewerSignup!.id}
          />
        </Suspense>
      )}
    </>,
  );
}
