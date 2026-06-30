import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified, expertiseSignalsOf } from "@/lib/directory";
import { getAskById, type AskKind, type AskUrgency } from "@/lib/db/asks";
import { DashboardShell } from "@/components/dashboard-shell";
import { IconArrowRight } from "@/components/icons";
import { PostForm } from "../../new/post-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit post — Pixel Parents",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Format a timestamptz value to YYYY-MM-DD for the <input type="date"> default.
function toDateInput(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export default async function EditExchangePostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
        You must be a verified OHS family to edit posts.
      </div>,
    );
  }

  const ask = await getAskById(id);
  if (!ask) notFound();

  // Author-only: a non-author trying to reach the edit page is bounced back to
  // the post (the server action also re-checks, so this is purely UX).
  if (ask.authorSignupId !== viewerSignup!.id) {
    redirect(`/exchange/${id}`);
  }

  const suggestedTags = expertiseSignalsOf(viewerSignup!).slice(0, 12);

  return shell(
    <>
      <header className="mb-8">
        <Link
          href={`/exchange/${id}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to post
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Edit post</h1>
      </header>
      <PostForm
        suggestedTags={suggestedTags}
        initial={{
          id: ask.id,
          kind: (ask.kind as AskKind) ?? "ask",
          title: ask.title,
          body: ask.body,
          tags: ask.expertiseTags ?? [],
          urgency: (ask.urgency as AskUrgency) ?? "normal",
          validUntil: toDateInput(ask.validUntil),
        }}
      />
    </>,
  );
}
