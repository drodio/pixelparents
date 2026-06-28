import { db } from "@/db";
import { events, eventApplicants, eventAttendees, eventDecisionLog, eventPhotos, evaluations, users } from "@/db/schema";
import { and, asc, desc, eq, inArray, ne, or, isNull, lt, gte, count, sql } from "drizzle-orm";
import { sendApprovedEmail, sendFutureEventsEmail } from "@/lib/email";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { computeCohortStats, isFounder, isInvestor, type CohortStats } from "@/lib/event-analytics";
import { getAveragedRadars, type CredibilityRadars } from "@/lib/credibility";

export type ApplicantStatus = "pending" | "scored" | "approved" | "denied" | "waitlist";

// SECURITY (P0-2, anti-relay): event-apply is unauthenticated and the
// auto-approval mails the body-supplied address, so a harvested evaluationId +
// a victim's email turns this into a branded-email relay. A per-RECIPIENT daily
// cap bounds the harm: a real applicant gets 1 event email (well under the cap),
// but an attacker can't spam one victim by applying many evaluationIds with that
// victim's email. Returns true while the recipient is still under the cap (and
// consumes one slot). The full fix (require auth / only mail eval-verified
// addresses) is a separate product decision; this is the safe, funnel-preserving
// mitigation.
async function recipientEmailAllowed(email: string): Promise<boolean> {
  const cap = Number(process.env.EVENT_EMAIL_PER_RECIPIENT_PER_DAY) || 5;
  const key = `event-email:${email.toLowerCase().trim()}`;
  return checkAndIncrementRateLimit(key, cap);
}

export async function getEventBySlug(slug: string) {
  const [row] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return row ?? null;
}

// Public recap index: events whose end (or start, if no end) is before now and
// that aren't drafts. Newest first.
export async function listPastEvents(limit = 100) {
  const now = new Date();
  return db
    .select()
    .from(events)
    .where(
      and(
        ne(events.status, "draft"),
        lt(sql`coalesce(${events.endsAt}, ${events.startsAt})`, now),
      ),
    )
    .orderBy(desc(events.startsAt))
    .limit(limit);
}

// Upcoming, non-draft events. Qualification filtering for claimed users is a
// later build; for now this returns all upcoming events soonest-first.
export async function listUpcomingEvents(limit = 100) {
  const now = new Date();
  return db
    .select()
    .from(events)
    .where(
      and(
        ne(events.status, "draft"),
        or(isNull(events.endsAt), gte(events.endsAt, now)),
        gte(sql`coalesce(${events.endsAt}, ${events.startsAt})`, now),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export type EventAnalytics = {
  totalAttendees: number; // approved RSVPs, matched or not
  matchedScored: number; // approved + matched to a scored profile
  stats: CohortStats;
  radars: CredibilityRadars; // averaged founder + investor composition
};

// Aggregate analytics for an event's recap. Counts approved RSVPs; for matched
// profiles, splits by canonical role and computes average scores + averaged
// composition radars. Returns null when no approved attendee matched a scored
// profile (nothing meaningful to show).
export async function getEventAnalytics(eventId: string): Promise<EventAnalytics | null> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.approvalStatus, "approved"),
        eq(eventAttendees.removedByAdmin, false),
      ),
    );

  // Resolve attendees to scored profiles the SAME way the attendees table does
  // (email match + unique exact-name fallback, any claimed status) so the counts
  // and radars match what the table shows.
  const { evalIds } = await resolveEventAttendeeEvalIds(eventId);
  if (evalIds.length === 0) return null;
  const matched = await db
    .select({
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      breakdown: evaluations.breakdown,
      signalQuality: evaluations.signalQuality,
    })
    .from(evaluations)
    .where(inArray(evaluations.id, evalIds));

  const scored = matched.filter((m) => m.signalQuality !== "low");
  if (scored.length === 0) return null;

  const stats = computeCohortStats(scored);
  // A founder-who-also-invests feeds BOTH radars (matches the cohort counts).
  const founderBreakdowns = scored.filter(isFounder).map((m) => m.breakdown);
  const investorBreakdowns = scored.filter(isInvestor).map((m) => m.breakdown);
  const radars = await getAveragedRadars(founderBreakdowns, investorBreakdowns);

  return { totalAttendees: Number(total), matchedScored: scored.length, stats, radars };
}

export type EventAttendeeRows = {
  rows: import("@/lib/leaderboard").LeaderboardRow[]; // matched attendees, leaderboard format
  unmatchedNames: string[]; // approved attendees with no scored profile
};

// Attendees of an event as leaderboard rows. Each approved attendee is resolved
// to a scored profile by their stored evaluationId (email match) OR, as a
// fallback, a UNIQUE exact full-name match — so we surface ALL profiles
// regardless of claimed status. Attendees with no scored profile are returned
// as name-only entries. Rows are sorted by combined score (desc).
// Resolve an event's approved attendees to scored evaluation ids: the stored
// evaluationId (email match) first, then a UNIQUE exact full-name fallback —
// looking at ALL scored profiles regardless of claimed status. Shared by the
// attendees table AND the cohort analytics so their numbers always agree.
export async function resolveEventAttendeeEvalIds(
  eventId: string,
): Promise<{ evalIds: string[]; unmatchedNames: string[] }> {
  const attendees = await db
    .select({ evaluationId: eventAttendees.evaluationId, name: eventAttendees.name })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.approvalStatus, "approved"),
        eq(eventAttendees.removedByAdmin, false),
      ),
    );

  const evalIds = new Set<string>();
  const unresolved: string[] = [];
  for (const a of attendees) {
    if (a.evaluationId) evalIds.add(a.evaluationId);
    else if (a.name && a.name.trim()) unresolved.push(a.name.trim());
  }

  const unmatchedNames: string[] = [];
  for (const name of unresolved) {
    const hits = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(sql`lower(${evaluations.fullName})`, name.toLowerCase()))
      .limit(2);
    if (hits.length === 1) evalIds.add(hits[0]!.id);
    else unmatchedNames.push(name);
  }
  return { evalIds: [...evalIds], unmatchedNames };
}

// The exact set of profiles a "Re-score attendees" job would enqueue: matched,
// approved, non-removed attendee evals (incl. name-resolved) that are source=
// "url" (reEvaluate refuses manual "code" scores). Shared by the rescore route
// AND the admin button label so the count shown always equals the count queued.
export async function getRescoreableAttendeeProfiles(
  eventId: string,
): Promise<{ id: string; linkedinUrl: string; fullName: string | null }[]> {
  const { evalIds } = await resolveEventAttendeeEvalIds(eventId);
  if (evalIds.length === 0) return [];
  return db
    .select({ id: evaluations.id, linkedinUrl: evaluations.linkedinUrl, fullName: evaluations.fullName })
    .from(evaluations)
    .where(and(inArray(evaluations.id, evalIds), eq(evaluations.source, "url")));
}

export async function getEventAttendeeRows(eventId: string): Promise<EventAttendeeRows> {
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const { evalIds, unmatchedNames } = await resolveEventAttendeeEvalIds(eventId);
  const rows = await getLeaderboardRowsForEvalIds(evalIds);
  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return { rows, unmatchedNames };
}

// All photos for an event, carousel order. Callers filter visibility with
// visiblePhotos() based on the viewer's attendee status.
export async function getEventPhotos(eventId: string) {
  return db
    .select({
      id: eventPhotos.id,
      eventId: eventPhotos.eventId,
      blobUrl: eventPhotos.blobUrl,
      source: eventPhotos.source,
      visibility: eventPhotos.visibility,
      caption: eventPhotos.caption,
      captionManual: eventPhotos.captionManual,
      sortOrder: eventPhotos.sortOrder,
      createdAt: eventPhotos.createdAt,
      uploadedByEvaluationId: eventPhotos.uploadedByEvaluationId,
      // Uploader (for the "added by <name>" credit). null for cover/legacy rows.
      // Prefer the uploader's chosen display name (users.nickname, e.g. "DROdio")
      // over their legal full name; fall back to fullName when no nickname is set.
      uploaderName: sql<string | null>`coalesce((select ${users.nickname} from ${users} where ${users.evaluationId} = ${eventPhotos.uploadedByEvaluationId} and ${users.nickname} is not null limit 1), ${evaluations.fullName})`,
      uploaderSlug: evaluations.slug,
      uploaderSlugKind: evaluations.slugKind,
    })
    .from(eventPhotos)
    .leftJoin(evaluations, eq(eventPhotos.uploadedByEvaluationId, evaluations.id))
    .where(eq(eventPhotos.eventId, eventId))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.createdAt));
}

// Materialize the Luma cover (event.coverUrl) as a real event_photos row so the
// admin can treat it like any other photo — caption it, change visibility, and
// drag it around. Idempotent: no-op if a row with that blobUrl already exists.
// Inserted just before the current first photo so it stays the cover initially.
// Called from the admin event page (a write), not from the public recap.
export async function ensureLumaCoverPhoto(eventId: string, coverUrl: string | null) {
  if (!coverUrl) return;
  const [existing] = await db
    .select({ id: eventPhotos.id })
    .from(eventPhotos)
    .where(and(eq(eventPhotos.eventId, eventId), eq(eventPhotos.blobUrl, coverUrl)))
    .limit(1);
  if (existing) return;
  const [{ minOrder }] = await db
    .select({ minOrder: sql<number>`coalesce(min(${eventPhotos.sortOrder}), 0)` })
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, eventId));
  await db.insert(eventPhotos).values({
    eventId,
    blobUrl: coverUrl,
    source: "luma_cover",
    visibility: "public",
    sortOrder: Number(minOrder) - 1,
  });
}

// Persist a new photo order (admin drag-to-reorder). ids is the full ordered
// list; each row's sortOrder is set to its index. Photos not in ids are left as-is.
export async function reorderEventPhotos(eventId: string, ids: string[]) {
  if (ids.length === 0) return;
  const stmts = ids.map((id, idx) =>
    db
      .update(eventPhotos)
      .set({ sortOrder: idx })
      .where(and(eq(eventPhotos.id, id), eq(eventPhotos.eventId, eventId))),
  );
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

export async function getEventById(id: string) {
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return row ?? null;
}

export async function listApplicants(opts: {
  eventId: string;
  status?: ApplicantStatus | ApplicantStatus[];
  limit?: number;
  offset?: number;
}) {
  const statuses = opts.status
    ? Array.isArray(opts.status)
      ? opts.status
      : [opts.status]
    : null;

  const where = statuses
    ? and(eq(eventApplicants.eventId, opts.eventId), inArray(eventApplicants.status, statuses))
    : eq(eventApplicants.eventId, opts.eventId);

  return db
    .select()
    .from(eventApplicants)
    .where(where)
    .orderBy(desc(eventApplicants.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function transitionApplicant(opts: {
  applicantId: string;
  toStatus: ApplicantStatus;
  reason: string;
  actorEmail: string;
}) {
  const [current] = await db
    .select()
    .from(eventApplicants)
    .where(eq(eventApplicants.id, opts.applicantId))
    .limit(1);
  if (!current) throw new Error(`applicant ${opts.applicantId} not found`);
  if (current.status === opts.toStatus) return current;

  // neon-http does not support db.transaction(); db.batch() is the atomic
  // alternative on this driver (runs as a single multi-statement
  // transaction over HTTP). This keeps the audit-log row in lockstep
  // with the status update.
  const now = new Date();
  await db.batch([
    db
      .update(eventApplicants)
      .set({
        status: opts.toStatus,
        decisionReason: opts.reason,
        decidedByEmail: opts.actorEmail,
        decidedAt: now,
        updatedAt: now,
      })
      .where(eq(eventApplicants.id, opts.applicantId)),
    db.insert(eventDecisionLog).values({
      applicantId: opts.applicantId,
      fromStatus: current.status,
      toStatus: opts.toStatus,
      reason: opts.reason,
      actorEmail: opts.actorEmail,
    }),
  ]);

  // Decision emails (per spec §9). Approved surfaces the score; waitlist/denied
  // avoid score + rejection language entirely.
  try {
    if (opts.toStatus === "approved") {
      const [e2] = await db.select().from(events).where(eq(events.id, current.eventId)).limit(1);
      if (e2 && current.email && (await recipientEmailAllowed(current.email))) {
        let score: { founder: number; investor: number } | null = null;
        if (current.evaluationId) {
          const [ev] = await db.select().from(evaluations).where(eq(evaluations.id, current.evaluationId)).limit(1);
          if (ev) score = { founder: ev.founderScore, investor: ev.investorScore };
        }
        await sendApprovedEmail({
          to: current.email,
          eventTitle: e2.title,
          startsAt: e2.startsAt,
          venue: e2.venue ?? null,
          lumaUrl: null, // P3: Luma integration
          score,
        });
      }
    } else if (opts.toStatus === "denied" || opts.toStatus === "waitlist") {
      const [e2] = await db.select().from(events).where(eq(events.id, current.eventId)).limit(1);
      if (e2 && current.email && (await recipientEmailAllowed(current.email))) {
        await sendFutureEventsEmail({ to: current.email, eventTitle: e2.title });
      }
    }
  } catch (err) {
    // Don't let email failure poison the transition. Log + continue.
    console.error("[events] email failed for applicant", opts.applicantId, err);
  }

  return {
    ...current,
    status: opts.toStatus,
    decisionReason: opts.reason,
    decidedByEmail: opts.actorEmail,
    decidedAt: now,
    updatedAt: now,
  };
}

export async function bulkTransition(opts: {
  applicantIds: string[];
  toStatus: ApplicantStatus;
  reason: string;
  actorEmail: string;
}) {
  let n = 0;
  for (const id of opts.applicantIds) {
    await transitionApplicant({
      applicantId: id,
      toStatus: opts.toStatus,
      reason: opts.reason,
      actorEmail: opts.actorEmail,
    });
    n++;
  }
  return n;
}
