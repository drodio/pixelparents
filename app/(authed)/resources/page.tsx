import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified } from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import { hasDatabase, getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { inArray } from "drizzle-orm";
import { listBoards, listBoardTags } from "@/lib/db/resources";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { BoardsClient, type BoardCard } from "./resources-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Resource Boards — Pixel Parents",
  description:
    "Community resource boards from the Stanford OHS family — organized, community-curated, and permanent. WhatsApp is great for chatter; here it stays.",
  robots: { index: false, follow: false },
};

function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resource Boards</h1>
      <p className="mt-1 max-w-2xl text-sm text-white/55">
        WhatsApp is great for chatter — but here everything stays{" "}
        <span className="text-white/75">organized, community-curated, and permanent</span>.
        Browse boards the OHS community built, or start your own.
      </p>
    </header>
  );
}

export default async function ResourcesPage() {
  // Signed-out → grayed shell + sign-in CTA, BEFORE any DB read (no PII loaded).
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

  // Gate: only VERIFIED OHS families see the boards (mirrors Community/Directory).
  if (!isVerified) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">Verify to use Resource Boards</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            {viewerSignup
              ? "Confirm your OHS student's Stanford email to browse and build community resource boards."
              : "Your account isn't recognized as an OHS family yet. Join Pixel Parents to use Resource Boards."}
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
          Resource Boards aren&apos;t available yet — check back soon.
        </div>
      </>,
    );
  }

  const viewerId = viewerSignup!.id;
  const [boards, tagCounts] = await Promise.all([
    listBoards({ viewerSignupId: viewerId }),
    listBoardTags(),
  ]);

  // Resolve author display name + member-type for every board in ONE batch query.
  // Names follow the directory coarsening: students show first name only; parents
  // show full name. No email/phone/child PII is exposed.
  const authorIds = Array.from(new Set(boards.map((b) => b.authorSignupId)));
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

  const cards: BoardCard[] = boards.map((b) => {
    const author = authorById.get(b.authorSignupId);
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      tags: b.tags,
      pinned: b.pinned,
      contributionCount: b.contributionCount,
      upvotes: b.upvotes,
      viewerUpvoted: b.viewerUpvoted,
      createdAt: (b.createdAt ?? new Date()).toISOString(),
      lastActivityAt: (b.lastActivityAt ?? b.createdAt ?? new Date()).toISOString(),
      authorName: author?.name ?? "A community member",
      isStudent: author?.isStudent ?? false,
      isMine: b.authorSignupId === viewerId,
    };
  });

  return shell(
    <>
      <PageHeader />
      <BoardsClient boards={cards} tagCounts={tagCounts} />
    </>,
  );
}
