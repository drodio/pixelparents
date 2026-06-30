import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import {
  isFamilyVerified,
  isDirectoryVisible,
  expertiseSignalsOf,
} from "@/lib/directory";
import { isStudentAccount } from "@/lib/family-display";
import {
  getAskById,
  getSuggestedHelpers,
  hasResponded,
  listResponsesForAsk,
  ASK_PROPOSES,
  type AskKind,
  type AskUrgency,
} from "@/lib/db/asks";
import { isExpired, isExpiringSoon } from "@/lib/exchange";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { inArray, eq } from "drizzle-orm";
import { DashboardShell } from "@/components/dashboard-shell";
import { IconArrowRight, IconClock, IconCircleCheck } from "@/components/icons";
import { iconForInterest } from "@/lib/interest-icons";
import { OfferHelpForm } from "./offer-help-form";
import { ResponseDecision } from "./response-decision";
import { PostControls } from "./post-controls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Exchange post — Pixel Parents",
  robots: { index: false, follow: false },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPOSE_LABEL: Record<(typeof ASK_PROPOSES)[number], string> = {
  async: "Async advice",
  zoom: "A short Zoom call",
  dinner: "Meet over a meal",
  other: "Something else",
};

const URGENCY_LABEL: Record<AskUrgency, string> = {
  low: "Low urgency",
  normal: "",
  high: "High urgency",
};

// Display info for a signup (name + optional in-tab profile link, gated by the
// member's directory visibility). Built for responders + suggested members.
type MemberDisplay = { name: string; token: string | null };

function fmtDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
}

export default async function ExchangePostPage({
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
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <h2 className="text-lg font-semibold">Verify to view the Exchange</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          {viewerSignup
            ? "Confirm your OHS student's Stanford email to view and respond to posts."
            : "Join Pixel Parents to view the Exchange."}
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

  const ask = await getAskById(id);
  if (!ask) notFound();

  const kind = (ask.kind as AskKind) ?? "ask";
  const isOffer = kind === "offer";
  const isAuthor = ask.authorSignupId === viewerSignup!.id;
  // Anyone verified who isn't the author can respond (parent OR student — the
  // #109 "students can't help" restriction is removed).
  const viewerCanRespond = !isAuthor;
  const expired = isExpired({ validUntil: ask.validUntil ? new Date(ask.validUntil).toISOString() : null });
  const soon = !expired && isExpiringSoon({ validUntil: ask.validUntil ? new Date(ask.validUntil).toISOString() : null });
  const resolved = ask.status === "resolved";

  const [responses, suggested, alreadyResponded, authorRows] = await Promise.all([
    listResponsesForAsk(id),
    getSuggestedHelpers(ask, 8),
    hasResponded(id, viewerSignup!.id),
    getDb().select().from(signups).where(eq(signups.id, ask.authorSignupId)).limit(1),
  ]);

  // Author profile card data. The profile LINK is gated by the author's directory
  // visibility (the same single-source-of-truth gate the directory/`/p` uses), so
  // we never leak a path to a private profile. Student authors are coarsened
  // (first name only). Expertise/enrichment tags come from the shared signal set.
  const authorRow = authorRows[0] ?? null;
  const authorIsStudent = authorRow ? isStudentAccount(authorRow) : false;
  const authorName = authorRow
    ? authorIsStudent
      ? authorRow.firstName
      : [authorRow.firstName, authorRow.lastName].filter(Boolean).join(" ")
    : "A community member";
  const authorToken = authorRow && isDirectoryVisible(authorRow) ? authorRow.shareToken : null;
  const authorTags = authorRow ? expertiseSignalsOf(authorRow).slice(0, 8) : [];

  // Resolve display info (name + visibility-gated link) for every responder.
  const responderIds = Array.from(new Set(responses.map((r) => r.responderSignupId)));
  const displayById = new Map<string, MemberDisplay>();
  if (responderIds.length > 0) {
    const rows = await getDb().select().from(signups).where(inArray(signups.id, responderIds));
    for (const r of rows) {
      displayById.set(r.id, {
        name: isStudentAccount(r)
          ? r.firstName
          : [r.firstName, r.lastName].filter(Boolean).join(" "),
        token: isDirectoryVisible(r) ? r.shareToken : null,
      });
    }
  }

  const responsesLabel = isOffer
    ? responses.length === 1
      ? "request"
      : "requests"
    : responses.length === 1
      ? "offer to help"
      : "offers to help";

  return shell(
    <>
      <Link
        href="/exchange"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
      >
        <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Exchange
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        {/* Left column: the post + responses */}
        <div>
          <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                  isOffer
                    ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                }`}
              >
                {isOffer ? "Offer" : "Ask"}
              </span>
              {URGENCY_LABEL[(ask.urgency as AskUrgency) ?? "normal"] && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    ask.urgency === "high"
                      ? "border-red-400/30 bg-red-400/10 text-red-200"
                      : "border-white/15 bg-white/[0.05] text-white/55"
                  }`}
                >
                  {URGENCY_LABEL[(ask.urgency as AskUrgency) ?? "normal"]}
                </span>
              )}
              {resolved && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">
                  <IconCircleCheck className="h-3 w-3" /> Resolved
                </span>
              )}
              {ask.status === "matched" && !resolved && (
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] capitalize text-white/70">
                  matched
                </span>
              )}
              {expired ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/45">
                  <IconClock className="h-3 w-3" /> Expired
                </span>
              ) : soon ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">
                  <IconClock className="h-3 w-3" /> Expires soon
                </span>
              ) : null}
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{ask.title}</h1>
            <p className="mt-3 whitespace-pre-wrap text-sm text-white/75">{ask.body}</p>

            {ask.validUntil && (
              <p className="mt-3 text-xs text-white/45">
                {expired ? "Expired" : "Valid until"} {fmtDate(ask.validUntil)}
              </p>
            )}

            {(ask.expertiseTags ?? []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(ask.expertiseTags ?? []).map((t) => {
                  const Icon = iconForInterest(t);
                  return (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80"
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      {t}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Creator-only management bar: edit / mark resolved / delete. */}
            {isAuthor && <PostControls id={ask.id} resolved={resolved} />}
          </article>

          {/* Response form — for anyone who isn't the author, on an open post who
              hasn't yet responded. Wording flips with direction. */}
          {viewerCanRespond && ask.status === "open" && !alreadyResponded && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-white/40">
                {isOffer ? "Request this" : "Offer to help"}
              </h2>
              <OfferHelpForm askId={ask.id} kind={kind} />
            </section>
          )}
          {viewerCanRespond && alreadyResponded && (
            <p className="mt-6 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
              {isOffer
                ? "You've requested this. The poster will let you know."
                : "You've offered to help. The poster will let you know."}
            </p>
          )}
          {isAuthor && ask.status === "open" && (
            <p className="mt-6 text-sm text-white/45">
              This is your post. {isOffer ? "Interested members" : "Helpers"} can respond below.
            </p>
          )}

          {/* Responses — visible to the author (who can accept/decline) and to each
              responder for their own response. */}
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-white/40">
              {responses.length} {responsesLabel}
            </h2>
            {responses.length === 0 ? (
              <p className="text-sm text-white/45">
                {isOffer ? "No requests yet." : "No offers yet."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {responses.map((r) => {
                  const isOwnResponse = r.responderClerkId === viewer.id;
                  // Privacy: a non-author only sees their OWN response. Author sees all.
                  if (!isAuthor && !isOwnResponse) return null;
                  const display = displayById.get(r.responderSignupId);
                  const accepted = r.status === "accepted";
                  const showIntro = accepted && (isAuthor || isOwnResponse);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-2xl border p-4 ${
                        accepted
                          ? "border-emerald-400/30 bg-emerald-400/[0.05]"
                          : r.status === "declined"
                            ? "border-white/10 bg-white/[0.01] opacity-60"
                            : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-white">
                          {display?.name ?? "A community member"}
                        </h3>
                        <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/65">
                          {PROPOSE_LABEL[r.proposes as keyof typeof PROPOSE_LABEL] ?? "Connect"}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{r.offer}</p>

                      {isAuthor && r.status === "offered" && (
                        <div className="mt-3">
                          <ResponseDecision responseId={r.id} />
                        </div>
                      )}
                      {r.status === "declined" && (
                        <p className="mt-2 text-xs text-white/45">Declined</p>
                      )}
                      {showIntro && (
                        <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2.5 text-sm text-emerald-100">
                          {accepted && isAuthor && <p>You accepted this. </p>}
                          {accepted && isOwnResponse && !isAuthor && <p>You were accepted. </p>}
                          {display?.token ? (
                            <Link
                              href={`/community/${display.token}`}
                              className="mt-1 inline-flex items-center gap-1.5 font-medium text-emerald-200 underline-offset-2 hover:underline"
                            >
                              View {display.name}&apos;s profile to connect{" "}
                              <IconArrowRight className="h-4 w-4" />
                            </Link>
                          ) : (
                            <p className="mt-1 text-emerald-200/80">
                              Reach out via the community — this member hasn&apos;t shared a public
                              profile.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column: author profile card + suggestions */}
        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
              Posted by
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{authorName}</h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  authorIsStudent
                    ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
                    : "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200"
                }`}
              >
                {authorIsStudent ? "Student" : "Parent"}
              </span>
            </div>
            {authorTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {authorTags.map((t) => {
                  const Icon = iconForInterest(t);
                  return (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/75"
                    >
                      <Icon className="h-3 w-3" strokeWidth={2} />
                      {t}
                    </span>
                  );
                })}
              </div>
            )}
            {authorToken ? (
              <Link
                href={`/community/${authorToken}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-300 hover:text-amber-200"
              >
                View profile <IconArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <p className="mt-4 text-xs text-white/40">
                This member hasn&apos;t shared a public profile.
              </p>
            )}
          </div>

          {/* Suggested members — top expertise matches. On an Ask, people who can
              help; on an Offer, members who might be interested. */}
          {suggested.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
                {isOffer ? "Members who might be interested" : "People who can help"}
              </p>
              <p className="mt-1 text-[11px] text-white/35">By expertise overlap.</p>
              <div className="mt-3 flex flex-col gap-2.5">
                {suggested.map((m) => {
                  const inner = (
                    <>
                      <h4 className="text-sm font-semibold text-white">
                        {m.name ?? "A community member"}
                      </h4>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.overlapTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </>
                  );
                  return m.token ? (
                    <Link
                      key={m.signupId}
                      href={`/community/${m.token}`}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-colors hover:border-amber-400/40 hover:bg-white/[0.04]"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={m.signupId}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                      title="This member hasn't shared a public profile."
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>,
  );
}
