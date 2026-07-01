import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { isFamilyVerified, expertiseSignalsOf } from "@/lib/directory";
import { resolveMentionables } from "@/lib/db/community-members";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { IconArrowRight } from "@/components/icons";
import { PostForm, type ConnectTarget } from "./post-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parse + AUTHORIZE the "connect with this person" pre-scope from the Directory
// profile CTA. The signup id is re-resolved against the DB here so we only ever
// pre-fill a mention for a real, VERIFIED, mentionable member (never a client-
// forged id), using that member's AUTHORITATIVE coarsened name — not whatever
// name the URL carried. Topics are the person's own tags to offer as chips; we
// only sanitize/cap them (they're just editable suggestions, not identities).
async function resolveConnectTarget(
  raw: Record<string, string | string[] | undefined>,
  selfSignupId: string,
): Promise<ConnectTarget | null> {
  const id = typeof raw.connect === "string" ? raw.connect : null;
  if (!id || !UUID_RE.test(id) || id === selfSignupId) return null;
  const resolved = await resolveMentionables([id]);
  const member = resolved.get(id);
  if (!member) return null; // unknown / unverified / not mentionable → no pre-scope

  const topicsRaw = typeof raw.topics === "string" ? raw.topics : "";
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const t of topicsRaw.split(",")) {
    const clean = t.trim().slice(0, 40);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(clean);
    if (topics.length >= 12) break;
  }
  return { signupId: member.signupId, name: member.name, topics };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New post — Pixel Parents",
  robots: { index: false, follow: false },
};

export default async function NewExchangePostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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
        <h2 className="text-lg font-semibold">Verify to post</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          {viewerSignup
            ? "Confirm your OHS student's Stanford email to post on the Community."
            : "Join Pixel Parents to post on the Community."}
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

  // Suggest the author's own expertise signals as quick-add tags — these are the
  // same tags the matcher uses, so it primes a useful tag set.
  const suggestedTags = expertiseSignalsOf(viewerSignup!).slice(0, 12);

  // If we arrived from a member's "Connect with <Name>" CTA, resolve + authorize
  // the target so the composer opens pre-scoped to THIS person (auto @-mention +
  // their topics as chips). Null when there's no/invalid connect param.
  const connect = await resolveConnectTarget(sp, viewerSignup!.id);

  // Distinguish "no connect intent" from "connect intent that couldn't resolve"
  // (stale/unverified/un-mentionable target). When a connect param WAS supplied
  // but resolved to null, we show an explicit notice instead of silently dumping
  // the user on the blank generic composer.
  const connectRequested =
    typeof sp.connect === "string" && UUID_RE.test(sp.connect) && sp.connect !== viewerSignup!.id;
  const connectUnavailable = connectRequested && !connect;

  return shell(
    <>
      <header className="mb-8">
        <Link
          href="/community"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
        >
          <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Community
        </Link>
        {connect ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Connect with {connect.name}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              {connect.topics.length > 0
                ? "Pick what you'd like to connect about and send a quick note. "
                : "Send a quick note and post it. "}
              <span className="text-amber-300">{connect.name}</span> is @-mentioned, so they&apos;ll
              be notified when you post.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New post</h1>
            <p className="mt-1 text-sm text-white/55">
              Post an <span className="text-amber-300">Ask</span> (you need help) or an{" "}
              <span className="text-violet-300">Offer</span> (you can help) — and tag the relevant
              expertise.
            </p>
          </>
        )}
      </header>
      {connectUnavailable && (
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/60">
          We couldn&apos;t set up a connection with that member — they may not be available right now.
          You can still post to the whole community below, or{" "}
          <Link href="/directory" className="text-amber-300 hover:text-amber-200">
            browse the directory
          </Link>{" "}
          to find someone else.
        </div>
      )}
      <PostForm suggestedTags={suggestedTags} connect={connect} />
    </>,
  );
}
