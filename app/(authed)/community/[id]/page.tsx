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
  hasShareableProfile,
  expertiseSignalsOf,
} from "@/lib/directory";
import { shareFieldsOrDefault } from "@/lib/share";
import { websiteUrlOf, curatedEnrichmentOf, type StoredEnrichment } from "@/lib/enrichment/profile";
import { aiRankMatches, type AiCandidate } from "@/lib/match-ai";
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
import {
  IconArrowRight,
  IconClock,
  IconCircleCheck,
  IconPhone,
  IconMail,
  IconGlobe,
  IconLinkedin,
  IconGithub,
} from "@/components/icons";
import { iconForInterest } from "@/lib/interest-icons";
import { deriveConnectionParty, type ConnectionParty } from "@/lib/intro";
import { OfferHelpForm } from "./offer-help-form";
import { ResponseDecision } from "./response-decision";
import { PostControls } from "./post-controls";
import { ConnectedCard, type ConnectedCardData, type ConnectedMethod } from "./connected-card";
import { ResponseThread, PublicPollList, type ThreadMessage } from "./response-thread";
import { listMessagesForResponses, getPollResults } from "@/lib/db/exchange-thread";
import { EngagementBar } from "./engagement-bar";
import { CommunityBody } from "../community-body";
import { extractMentionIds } from "@/lib/mentions";
import { resolveMentionables } from "@/lib/db/community-members";
import { formatSlot } from "@/lib/community-schedule";
import {
  countUpvotes,
  countAttachments,
  hasUpvoted,
  hasAttached,
  listAttachmentMemberIds,
  slotsByResponse,
} from "@/lib/db/community-engage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community post — GoPixel",
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

// Project a server-derived ConnectionParty (lib/intro) into the client card's
// serializable shape. The reveal/minor-routing decisions already happened in
// deriveConnectionParty; this only flattens contact methods for the client.
function toCardData(
  party: ConnectionParty,
  opts: { helpWith: string | null; youAreAuthor: boolean },
): ConnectedCardData {
  const methods: ConnectedMethod[] = party.methods.map((m) => ({
    kind: m.kind,
    // email/phone show the raw value; links show their short label.
    label: m.kind === "email" || m.kind === "phone" ? m.value : m.value,
    href: m.href,
    copy: m.href.replace(/^(mailto:|tel:)/, ""),
  }));
  return {
    name: party.name,
    isStudent: party.isStudent,
    viaParentName: party.viaParentName,
    methods,
    messageHint: party.messageHint,
    helpWith: opts.helpWith,
    youAreAuthor: opts.youAreAuthor,
  };
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
        <h2 className="text-lg font-semibold">Verify to view the Community</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          {viewerSignup
            ? "Confirm your OHS student's Stanford email to view and respond to posts."
            : "Join GoPixel to view the Community."}
        </p>
        <Link
          href={viewerSignup ? "/verify" : "/signup"}
          className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
        >
          {viewerSignup ? "Verify now" : "Join GoPixel"}
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

  const [
    responses,
    suggestedRaw,
    alreadyResponded,
    authorRows,
    upvoteCount,
    attachmentCount,
    viewerUpvoted,
    viewerAttached,
    attachmentMemberIds,
  ] = await Promise.all([
    listResponsesForAsk(id),
    getSuggestedHelpers(ask, 8),
    hasResponded(id, viewerSignup!.id),
    getDb().select().from(signups).where(eq(signups.id, ask.authorSignupId)).limit(1),
    countUpvotes(id),
    countAttachments(id),
    hasUpvoted(id, viewerSignup!.id),
    hasAttached(id, viewerSignup!.id),
    listAttachmentMemberIds(id),
  ]);

  // AI-assisted semantic re-rank of the suggested helpers. getSuggestedHelpers
  // already applied the deterministic tag-overlap matcher (the candidate
  // pre-filter + privacy gating); here we hand those top candidates + their
  // SHAREABLE info-profiles to the model to re-rank by semantic fit and attach a
  // one-line rationale per card. On no AI key / any failure this returns the
  // deterministic order unchanged (lib/match-ai never throws), so the page never
  // breaks. We send ONLY non-PII matching data (the same expertise signals the
  // matcher uses + the curated bio/expertise slice) — no new contact info is
  // exposed, and the candidate set itself is exactly what the privacy layer
  // already allowed to surface.
  let suggested = suggestedRaw;
  if (suggestedRaw.length > 1) {
    const ids = suggestedRaw.map((m) => m.signupId);
    const profileRows = await getDb().select().from(signups).where(inArray(signups.id, ids));
    const rowById = new Map(profileRows.map((r) => [r.id, r]));
    const aiCandidates: AiCandidate[] = suggestedRaw.map((m) => {
      const row = rowById.get(m.signupId);
      const stored = row
        ? (((row.extra ?? {}) as Record<string, unknown>).enrichment as StoredEnrichment | null | undefined)
        : null;
      const curated = curatedEnrichmentOf(stored);
      return {
        signupId: m.signupId,
        displayName: m.name,
        expertiseSignals: row ? expertiseSignalsOf(row) : [],
        bio: curated?.bio ?? null,
        enrichmentExpertise: curated?.expertiseTags ?? [],
        canHelpWith: curated?.canHelpWith ?? [],
      };
    });
    suggested = await aiRankMatches(
      {
        id: ask.id,
        title: ask.title,
        body: ask.body,
        tags: ask.expertiseTags ?? [],
        kind,
      },
      suggestedRaw,
      aiCandidates,
    );
  }

  // Author profile card data. The profile LINK is gated by whether the author has
  // a SHAREABLE profile — hasShareableProfile, NOT isDirectoryVisible. The latter
  // wrongly excludes every student author (students get no standalone directory
  // grid card, but they CAN share a profile), which made a student author's card
  // always read "hasn't shared a public profile." Student authors are still
  // coarsened (first name only). Expertise/enrichment tags come from the shared
  // signal set.
  const authorRow = authorRows[0] ?? null;
  const authorIsStudent = authorRow ? isStudentAccount(authorRow) : false;
  const authorName = authorRow
    ? authorIsStudent
      ? authorRow.firstName
      : [authorRow.firstName, authorRow.lastName].filter(Boolean).join(" ")
    : "A community member";
  // The viewer has already passed the verified-OHS-family gate above, so the
  // author's "ohs" visibility resolves; hasShareableProfile applies the rest of
  // the share preconditions (enabled + token + name + family verified).
  const authorShareable = authorRow ? hasShareableProfile(authorRow) : false;
  const authorToken = authorShareable ? authorRow!.shareToken : null;
  const authorTags = authorRow ? expertiseSignalsOf(authorRow).slice(0, 8) : [];

  // The author's SHARED contact + professional links, honoring exactly the same
  // per-field share gates the /p profile uses (shareFieldsOrDefault): email/phone
  // behind the "phone"/"email" fields; LinkedIn/GitHub/website behind the NEW,
  // default-OFF "links" field. Only computed for a shareable profile, and only
  // ever rendered to this already-OHS-family viewer. Empty for a private/unshared
  // author so the "hasn't shared a public profile" copy stays correct.
  const authorShareFields =
    authorShareable && authorRow ? new Set(shareFieldsOrDefault(authorRow.shareFields)) : new Set<string>();
  const authorEmail = authorShareFields.has("email") ? authorRow?.email?.trim() || null : null;
  const authorPhone = authorShareFields.has("phone") ? authorRow?.phone?.trim() || null : null;
  const authorLinkedin = authorShareFields.has("links") ? authorRow?.linkedinUrl?.trim() || null : null;
  const authorGithub =
    authorShareFields.has("links") && authorRow?.githubUsername?.trim()
      ? `https://github.com/${authorRow.githubUsername.trim()}`
      : null;
  const authorWebsite = authorShareFields.has("links")
    ? websiteUrlOf((authorRow?.extra ?? {}) as Record<string, unknown>)
    : null;
  const authorHasInlineContact = Boolean(
    authorEmail || authorPhone || authorLinkedin || authorGithub || authorWebsite,
  );

  // Resolve display info (name + visibility-gated link) for every responder.
  const responderIds = Array.from(new Set(responses.map((r) => r.responderSignupId)));
  const displayById = new Map<string, MemberDisplay>();
  const responderRowById = new Map<string, (typeof signups.$inferSelect)>();
  if (responderIds.length > 0) {
    const rows = await getDb().select().from(signups).where(inArray(signups.id, responderIds));
    for (const r of rows) {
      responderRowById.set(r.id, r);
      displayById.set(r.id, {
        name: isStudentAccount(r)
          ? r.firstName
          : [r.firstName, r.lastName].filter(Boolean).join(" "),
        token: hasShareableProfile(r) ? r.shareToken : null,
      });
    }
  }

  // For each ACCEPTED response, derive the reveal-safe ConnectionParty for BOTH
  // sides (lib/intro honors the share model + routes minors through a parent), so
  // the connected panel can show the OTHER person to whoever is viewing. We pull
  // the family rows (by family_id) for the author + each accepted responder ONCE
  // here — needed to route a minor's contact through a guardian. The viewer only
  // ever sees a card when they're a party to that accept (enforced below).
  const acceptedResponses = responses.filter((r) => r.status === "accepted");
  const connectionByResponseId = new Map<
    string,
    { author: ConnectionParty; responder: ConnectionParty }
  >();
  if (acceptedResponses.length > 0 && authorRow) {
    // Family_ids we need parents for: the author's + each accepted responder's.
    const familyIds = new Set<string>([authorRow.familyId]);
    for (const r of acceptedResponses) {
      const row = responderRowById.get(r.responderSignupId);
      if (row) familyIds.add(row.familyId);
    }
    const famRows =
      familyIds.size > 0
        ? await getDb()
            .select()
            .from(signups)
            .where(inArray(signups.familyId, Array.from(familyIds)))
        : [];
    const parentsByFamily = new Map<string, (typeof signups.$inferSelect)[]>();
    for (const row of famRows) {
      const list = parentsByFamily.get(row.familyId) ?? [];
      list.push(row);
      parentsByFamily.set(row.familyId, list);
    }
    const authorParty = deriveConnectionParty(
      authorRow,
      parentsByFamily.get(authorRow.familyId) ?? [],
    );
    for (const r of acceptedResponses) {
      const row = responderRowById.get(r.responderSignupId);
      if (!row) continue;
      const responderParty = deriveConnectionParty(
        row,
        parentsByFamily.get(row.familyId) ?? [],
      );
      connectionByResponseId.set(r.id, { author: authorParty, responder: responderParty });
    }
  }

  // Resolve @-mention links for the post body + every response. We gather every
  // signup id referenced by a marker, resolve them ONCE (verified-only; a
  // non-mentionable id resolves to no entry → renders as plain amber text, never
  // a link to a private profile), and build an id→token map. A token is present
  // only when that member shares a profile (hasShareableProfile inside
  // resolveMentionables), so a mention links out exactly when the member opted in.
  const mentionIds = new Set<string>(extractMentionIds(ask.body));
  for (const r of responses) for (const mid of extractMentionIds(r.offer)) mentionIds.add(mid);
  const mentionLinkById = new Map<string, string | null>();
  if (mentionIds.size > 0) {
    const resolved = await resolveMentionables(Array.from(mentionIds));
    for (const [mid, m] of resolved) mentionLinkById.set(mid, m.token);
  }

  // Proposed scheduling slots per response (shown to the author + the responder).
  const slotsForResponses = await slotsByResponse(responses.map((r) => r.id));

  // --- Exchange thread: the back-and-forth on each response --------------------
  // A viewer is a PARTY to a response if they authored the post OR they authored
  // that response. This flag drives BOTH the private-message visibility filter
  // (private messages only reach parties) and whether the composer renders. It is
  // computed here server-side — never trusted from the client.
  const viewerSignupId = viewerSignup!.id;
  const viewerIsPartyByResponseId = new Map<string, boolean>();
  for (const r of responses) {
    viewerIsPartyByResponseId.set(
      r.id,
      isAuthor || r.responderSignupId === viewerSignupId,
    );
  }
  const threadMessages = await listMessagesForResponses(
    responses.map((r) => r.id),
    viewerSignupId,
    viewerIsPartyByResponseId,
  );
  // Coarsened display label for a message author (student = first name only).
  // Message authors are always parties, so their rows are already loaded (author
  // row + responder rows); fall back to a generic label if a row is missing.
  const messageAuthorLabel = (signupId: string): string => {
    if (authorRow && signupId === authorRow.id) return authorName;
    const row = responderRowById.get(signupId);
    if (!row) return "A community member";
    return isStudentAccount(row)
      ? row.firstName
      : [row.firstName, row.lastName].filter(Boolean).join(" ");
  };
  // Poll results: aggregate votes for every poll message + this viewer's own
  // choice per poll. Any verified member can vote, so we always fetch (the viewer
  // is verified past the gate above).
  const pollMessages = threadMessages.filter((m) => m.kind === "poll" && m.poll);
  const pollResultsByMessageId = await getPollResults(
    pollMessages.map((m) => ({ messageId: m.id, optionCount: m.poll!.options.length })),
    viewerSignupId,
  );
  // Group + project messages per response into the client thread shape.
  const threadByResponseId = new Map<string, ThreadMessage[]>();
  for (const m of threadMessages) {
    const list = threadByResponseId.get(m.responseId) ?? [];
    const results = m.kind === "poll" ? pollResultsByMessageId.get(m.id) : undefined;
    list.push({
      id: m.id,
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
      authorSignupId: m.authorSignupId,
      authorName: messageAuthorLabel(m.authorSignupId),
      isOwn: m.authorSignupId === viewerSignupId,
      kind: m.kind,
      visibility: m.visibility,
      body: m.body,
      proposedEvent: m.proposedEvent,
      eventId: m.eventId,
      eventStatus: m.eventStatus,
      isProposer: m.authorSignupId === viewerSignupId,
      poll: m.poll
        ? {
            question: m.poll.question,
            options: m.poll.options,
            closed: m.poll.closed === true,
            counts: results?.counts ?? new Array(m.poll.options.length).fill(0),
            total: results?.total ?? 0,
            viewerOptionIndex: results?.viewerOptionIndex ?? null,
          }
        : null,
    });
    threadByResponseId.set(m.responseId, list);
  }

  // PUBLIC POLLS: a poll lives inside a private response, but "public voting" is
  // the whole point — the copy promises anyone viewing the post can vote. Parties
  // see a response's polls inline in that response's thread; for responses the
  // viewer is NOT a party to (whose cards don't render for them), we surface those
  // polls in a standalone "Community polls" section so any verified member can
  // actually vote. Polls are always public by construction (addPoll), so this
  // never leaks private response content. De-duped by message id defensively.
  const seenPollIds = new Set<string>();
  const publicPolls: ThreadMessage[] = [];
  for (const [responseId, list] of threadByResponseId) {
    if (viewerIsPartyByResponseId.get(responseId) === true) continue; // shown inline
    for (const m of list) {
      if (m.kind === "poll" && m.poll && !seenPollIds.has(m.id)) {
        seenPollIds.add(m.id);
        publicPolls.push(m);
      }
    }
  }

  // Display cards for members who attached ("I'd join this too"). Coarsened name +
  // a profile link only when they share one — same privacy gate as everywhere.
  const joiners: { signupId: string; name: string; token: string | null; isStudent: boolean }[] =
    [];
  if (attachmentMemberIds.length > 0) {
    const rows = await getDb().select().from(signups).where(inArray(signups.id, attachmentMemberIds));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const mid of attachmentMemberIds) {
      const r = byId.get(mid);
      if (!r) continue;
      joiners.push({
        signupId: r.id,
        name: isStudentAccount(r)
          ? r.firstName
          : [r.firstName, r.lastName].filter(Boolean).join(" "),
        token: hasShareableProfile(r) ? r.shareToken : null,
        isStudent: isStudentAccount(r),
      });
    }
  }

  // The viewer's OWN response (if any), so we can reflect its real status — not
  // just a status-agnostic "you responded" boolean. A DECLINED responder must not
  // keep seeing the reassuring "the poster will let you know" banner.
  const viewerOwnResponse =
    responses.find(
      (r) => r.responderSignupId === viewerSignupId || r.responderClerkId === viewer.id,
    ) ?? null;
  const viewerResponseStatus = viewerOwnResponse?.status ?? null;

  // Whether this post can still accept a NEW response: open AND not expired.
  // Expiry is date-based (no job flips status), so an expired-but-open post must
  // NOT show a working response form (the server also rejects — respondToAskAction).
  const acceptingResponses = ask.status === "open" && !expired;

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
        href="/community"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80"
      >
        <IconArrowRight className="h-4 w-4 rotate-180" /> Back to Community
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
            <CommunityBody
              body={ask.body}
              linkById={mentionLinkById}
              className="mt-3 whitespace-pre-wrap text-sm text-white/75"
            />

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

            {/* Upvote + attach/join — any verified viewer (incl. the author). */}
            <EngagementBar
              askId={ask.id}
              initialUpvotes={upvoteCount}
              initialAttachments={attachmentCount}
              initialUpvoted={viewerUpvoted}
              initialAttached={viewerAttached}
              canEngage={isVerified}
            />

            {/* Members who said they'd join. Coarsened names; link only if shared. */}
            {joiners.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
                  {joiners.length} {joiners.length === 1 ? "member" : "members"} would join
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {joiners.map((j) => {
                    const chip = (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/80">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/20 text-[10px] font-semibold text-amber-300">
                          {j.name.charAt(0).toUpperCase()}
                        </span>
                        {j.name}
                        {j.isStudent && <span className="text-white/40">· student</span>}
                      </span>
                    );
                    return j.token ? (
                      // Wrap the linked chip in an <li> too — an <a> as a direct
                      // child of <ul> is invalid HTML and breaks list semantics for
                      // assistive tech (the count wouldn't match the enumerated list).
                      <li key={j.signupId} className="list-none">
                        <Link href={`/directory/${j.token}`} className="hover:opacity-90">
                          {chip}
                        </Link>
                      </li>
                    ) : (
                      <li key={j.signupId} className="list-none">
                        {chip}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Creator-only management bar: edit / mark resolved / delete. */}
            {isAuthor && <PostControls id={ask.id} resolved={resolved} />}
          </article>

          {/* Response form — for anyone who isn't the author, on a post that's
              still accepting responses (open AND not expired), who hasn't yet
              responded. Wording flips with direction. */}
          {viewerCanRespond && acceptingResponses && !alreadyResponded && (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-white/40">
                {isOffer ? "Request this" : "Offer to help"}
              </h2>
              <OfferHelpForm askId={ask.id} kind={kind} />
            </section>
          )}
          {/* The viewer already responded — reflect their response's REAL status.
              Accepted → connected (the ConnectedCard shows below in their response);
              declined → a neutral "wasn't taken up"; still pending ("offered") →
              the reassuring banner. */}
          {viewerCanRespond && alreadyResponded && viewerResponseStatus === "declined" && (
            <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/60">
              Your offer wasn&apos;t taken up this time. You&apos;re welcome to explore other posts on
              the Community.
            </p>
          )}
          {viewerCanRespond && alreadyResponded && viewerResponseStatus !== "declined" && (
            <p className="mt-6 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
              {viewerResponseStatus === "accepted"
                ? "You're connected — see the details below."
                : isOffer
                  ? "You've requested this. The poster will let you know."
                  : "You've offered to help. The poster will let you know."}
            </p>
          )}
          {/* Non-author who hasn't responded, on a post that's NOT accepting new
              responses — explain why there's no form instead of a silent dead-end. */}
          {viewerCanRespond && !alreadyResponded && !acceptingResponses && (
            <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/60">
              {expired
                ? "This post has expired — it's no longer accepting new responses."
                : ask.status === "matched"
                  ? `This post has been matched — it's no longer accepting new ${isOffer ? "requests" : "offers"}.`
                  : resolved
                    ? "This post has been resolved — it's no longer accepting new responses."
                    : "This post is no longer accepting new responses."}
            </p>
          )}
          {isAuthor && acceptingResponses && (
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
                      <CommunityBody
                        body={r.offer}
                        linkById={mentionLinkById}
                        className="mt-2 whitespace-pre-wrap text-sm text-white/75"
                      />

                      {/* Proposed scheduling options on this response, if any. */}
                      {(slotsForResponses.get(r.id)?.length ?? 0) > 0 && (
                        <div className="mt-3 flex flex-col gap-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
                            Proposed times
                          </p>
                          <ul className="flex flex-wrap gap-1.5">
                            {slotsForResponses.get(r.id)!.map((slot) => (
                              <li
                                key={slot.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/75"
                              >
                                <IconClock className="h-3 w-3 text-white/45" />
                                {formatSlot(slot.startsAt)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {isAuthor && r.status === "offered" && (
                        <div className="mt-3">
                          <ResponseDecision responseId={r.id} />
                        </div>
                      )}
                      {r.status === "declined" && (
                        <p className="mt-2 text-xs text-white/45">Declined</p>
                      )}
                      {showIntro &&
                        (() => {
                          // The connected panel reveals the OTHER party to whoever
                          // is viewing: the author sees the responder; the responder
                          // sees the author. Parties are pre-derived (share-honored,
                          // minor-routed). "Connecting over" = the post topic +
                          // proposed format.
                          const conn = connectionByResponseId.get(r.id);
                          if (!conn) return null;
                          const other = isAuthor ? conn.responder : conn.author;
                          const helpWith = [
                            ask.title,
                            PROPOSE_LABEL[r.proposes as keyof typeof PROPOSE_LABEL],
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <ConnectedCard
                              data={toCardData(other, {
                                helpWith: helpWith || null,
                                youAreAuthor: isAuthor,
                              })}
                            />
                          );
                        })()}

                      {/* The conversation thread on this response. A viewer who is
                          a party (post author or this responder) gets the composer
                          + any private messages; others see the public thread only.
                          The server already filtered private messages to parties. */}
                      <ResponseThread
                        responseId={r.id}
                        viewerIsParty={viewerIsPartyByResponseId.get(r.id) === true}
                        messages={threadByResponseId.get(r.id) ?? []}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Public polls the viewer can vote on but isn't a party to (party
              polls are shown inline above). Empty → renders nothing. */}
          <PublicPollList polls={publicPolls} />
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
            {/* The author's SHARED contact + professional links, inline — each
                gated by the author's own per-field share selection (and only ever
                shown to this already-OHS-family viewer). */}
            {authorHasInlineContact && (
              <div className="mt-4 flex flex-col gap-1.5 text-sm">
                {authorEmail && (
                  <a
                    href={`mailto:${authorEmail}`}
                    className="inline-flex items-center gap-1.5 text-white/75 hover:text-white"
                  >
                    <IconMail className="h-4 w-4 text-white/45" />
                    {authorEmail}
                  </a>
                )}
                {authorPhone && (
                  <a
                    href={`tel:${authorPhone}`}
                    className="inline-flex items-center gap-1.5 text-white/75 hover:text-white"
                  >
                    <IconPhone className="h-4 w-4 text-white/45" />
                    {authorPhone}
                  </a>
                )}
                {authorWebsite && (
                  <a
                    href={authorWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white/75 hover:text-white"
                  >
                    <IconGlobe className="h-4 w-4 text-white/45" />
                    Website
                  </a>
                )}
                {authorLinkedin && (
                  <a
                    href={authorLinkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white/75 hover:text-white"
                  >
                    <IconLinkedin className="h-4 w-4 text-white/45" />
                    LinkedIn
                  </a>
                )}
                {authorGithub && (
                  <a
                    href={authorGithub}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-white/75 hover:text-white"
                  >
                    <IconGithub className="h-4 w-4 text-white/45" />
                    GitHub
                  </a>
                )}
              </div>
            )}
            {authorToken ? (
              <Link
                href={`/directory/${authorToken}`}
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
              <p className="mt-1 text-[11px] text-white/35">
                {suggested.some((m) => m.rationale)
                  ? "Ranked by fit."
                  : "By expertise overlap."}
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                {suggested.map((m) => {
                  const inner = (
                    <>
                      <h4 className="text-sm font-semibold text-white">
                        {m.name ?? "A community member"}
                      </h4>
                      {/* AI semantic-match rationale, shown subtly when present.
                          Absent on the deterministic fallback path. */}
                      {m.rationale && (
                        <p className="mt-1 text-[11px] italic leading-snug text-white/50">
                          {m.rationale}
                        </p>
                      )}
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
                      href={`/directory/${m.token}`}
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
