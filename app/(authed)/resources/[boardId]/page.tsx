import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import {
  getBoard,
  listContributions,
  isFollowingBoard,
} from "@/lib/db/resources";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight } from "@/components/icons";
import { BoardDetailClient, type ContributionCard, type BoardHeader } from "./board-client";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "Board — Pixel Parents",
  robots: { index: false, follow: false },
};

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  if (!UUID_RE.test(boardId)) notFound();

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
        Only verified OHS families can view boards.{" "}
        <Link href="/resources" className="text-amber-300 hover:text-amber-200">
          Back to boards
        </Link>
      </div>,
    );
  }

  const viewerId = viewerSignup!.id;
  const board = await getBoard({ id: boardId, viewerSignupId: viewerId });
  if (!board) notFound();

  const [contributions, following] = await Promise.all([
    listContributions({ boardId, viewerSignupId: viewerId }),
    isFollowingBoard({ boardId, signupId: viewerId }),
  ]);

  // Resolve author display names for the board + every contribution in ONE batch.
  const authorIds = Array.from(
    new Set([board.authorSignupId, ...contributions.map((c) => c.authorSignupId)]),
  );
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

  const boardAuthor = authorById.get(board.authorSignupId);
  const header: BoardHeader = {
    id: board.id,
    title: board.title,
    description: board.description,
    tags: board.tags,
    pinned: board.pinned,
    upvotes: board.upvotes,
    viewerUpvoted: board.viewerUpvoted,
    contributionCount: board.contributionCount,
    createdAt: (board.createdAt ?? new Date()).toISOString(),
    authorName: boardAuthor?.name ?? "A community member",
    isStudent: boardAuthor?.isStudent ?? false,
    isMine: board.authorSignupId === viewerId,
    following,
  };

  const cards: ContributionCard[] = contributions.map((c) => {
    const a = authorById.get(c.authorSignupId);
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      url: c.url,
      filePath: c.filePath,
      fileName: c.fileName,
      body: c.body,
      upvotes: c.upvotes,
      viewerUpvoted: c.viewerUpvoted,
      createdAt: (c.createdAt ?? new Date()).toISOString(),
      authorName: a?.name ?? "A community member",
      isStudent: a?.isStudent ?? false,
      isMine: c.authorSignupId === viewerId,
    };
  });

  return shell(
    <div className="mx-auto max-w-3xl">
      <Link
        href="/resources"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
      >
        <IconArrowRight className="h-4 w-4 rotate-180" />
        All boards
      </Link>
      <BoardDetailClient header={header} contributions={cards} />
    </div>,
  );
}
