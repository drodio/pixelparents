import { db } from "@/db";
import { eventAttendees, evaluations, scoringJobItems, scoringJobs } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";

// A suggested profile for an UNMATCHED attendee (best name match), shown inline
// with an [Apply] button that links the Luma row to it.
export type ProbableMatch = {
  evaluationId: string;
  name: string | null;
  companyName: string | null;
  combinedScore: number;
  profileHref: string | null;
};

// One row in the admin attendee manager. Matched rows carry a profile link +
// combined score; unmatched rows are name-only (no Festival profile) and may
// carry a `probableMatch` (a same-name profile the admin can one-click Apply).
export type AdminAttendeeRow = {
  id: string; // eventAttendees.id — the handle for Remove
  name: string | null;
  // The matched profile owner's chosen nickname (claimed, high-confidence) when
  // set; null for unmatched rows or when no nickname is set. Feeds {{nickname}}.
  nickname: string | null;
  source: "luma" | "manual";
  evaluationId: string | null;
  matched: boolean;
  profileHref: string | null;
  combinedScore: number | null;
  probableMatch?: ProbableMatch | null;
  linkedinUrl: string | null;
  email: string | null;
};

// Current (non-removed) attendees for the admin manager. Matched rows are
// deduped by evaluationId (a person can exist as both a Luma row and a manual
// row) and enriched with profile href + score. Sorted: matched by score desc,
// then unmatched.
export async function listEventAttendeesAdmin(eventId: string): Promise<AdminAttendeeRow[]> {
  // Order by source desc ("manual" > "luma" alphabetically) so that when a
  // person has both a Luma row and a manual row with the same evaluationId, the
  // manual row wins the dedupe — its id is the stable Remove handle.
  const rows = await db
    .select({
      id: eventAttendees.id,
      name: eventAttendees.name,
      source: eventAttendees.source,
      evaluationId: eventAttendees.evaluationId,
      linkedinUrl: eventAttendees.linkedinUrl,
      email: eventAttendees.email,
    })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.removedByAdmin, false)))
    .orderBy(desc(eventAttendees.source));

  const evalIds = [...new Set(rows.filter((r) => r.evaluationId).map((r) => r.evaluationId!))];
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const lbRows = evalIds.length ? await getLeaderboardRowsForEvalIds(evalIds) : [];
  const lbById = new Map(lbRows.map((r) => [r.id, r]));

  const seenEval = new Set<string>();
  const out: AdminAttendeeRow[] = [];
  for (const r of rows) {
    if (r.evaluationId) {
      if (seenEval.has(r.evaluationId)) continue;
      seenEval.add(r.evaluationId);
      const lb = lbById.get(r.evaluationId);
      out.push({
        id: r.id,
        name: r.name,
        nickname: lb?.nickname ?? null,
        source: r.source as "luma" | "manual",
        evaluationId: r.evaluationId,
        // "matched" = the attendee is linked to a real profile, regardless of
        // whether that profile is leaderboard-visible. (lb supplies score/href.)
        matched: true,
        profileHref: lb?.profileHref ?? null,
        combinedScore: lb?.combinedScore ?? null,
        linkedinUrl: r.linkedinUrl ?? null,
        email: r.email ?? null,
      });
    } else {
      out.push({
        id: r.id,
        name: r.name,
        nickname: null,
        source: r.source as "luma" | "manual",
        evaluationId: null,
        matched: false,
        profileHref: null,
        combinedScore: null,
        linkedinUrl: r.linkedinUrl ?? null,
        email: r.email ?? null,
      });
    }
  }
  out.sort((a, b) => (b.combinedScore ?? -1) - (a.combinedScore ?? -1));

  // For genuinely-unmatched rows, suggest the best same-name profile so the admin
  // can one-click [Apply] to link it. Skip profiles already attending this event.
  const attachedEvalIds = new Set(out.filter((r) => r.evaluationId).map((r) => r.evaluationId!));
  const unmatched = out.filter((r) => !r.evaluationId && (r.name?.trim().length ?? 0) >= 2);
  if (unmatched.length > 0) {
    const { searchLeaderboard, parseLeaderboardFilter } = await import("@/lib/leaderboard");
    const filter = parseLeaderboardFilter(new URLSearchParams());
    // Cap the fan-out (one search per unmatched name); events rarely have many.
    await Promise.all(
      unmatched.slice(0, 40).map(async (row) => {
        try {
          const hits = await searchLeaderboard(filter, row.name!);
          const best = hits.find((h) => !attachedEvalIds.has(h.id));
          if (best) {
            row.probableMatch = {
              evaluationId: best.id,
              name: best.fullName,
              companyName: best.companyName ?? null,
              combinedScore: best.combinedScore,
              profileHref: best.profileHref ?? null,
            };
          }
        } catch {
          /* a failed suggestion is non-fatal — the row just has no probableMatch */
        }
      }),
    );
  }
  return out;
}

// Link an existing (Luma or manual) attendee row to a profile — the [Apply]
// action behind a probable match, or an admin's manual override pick. Sets the
// row's evaluationId so it counts as matched. Scoped to the event.
export async function linkAttendeeProfile(
  eventId: string,
  attendeeId: string,
  evaluationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev) return { ok: false, error: "eval_not_found" };
  const res = await db
    .update(eventAttendees)
    .set({ evaluationId: ev.id, updatedAt: sql`now()` })
    .where(and(eq(eventAttendees.id, attendeeId), eq(eventAttendees.eventId, eventId)))
    .returning({ id: eventAttendees.id });
  if (res.length === 0) return { ok: false, error: "attendee_not_found" };
  return { ok: true };
}

// Add (or un-remove) a manual attendee from a scored profile. Upserts on the
// synthetic key "manual:<evalId>" so the same person can't be double-added and
// re-adding a removed person just flips removedByAdmin back to false.
export async function addManualAttendee(
  eventId: string,
  evaluationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, foundEmail: evaluations.foundEmail })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev) return { ok: false, error: "not_found" };

  await db
    .insert(eventAttendees)
    .values({
      eventId,
      evaluationId: ev.id,
      lumaGuestApiId: `manual:${ev.id}`,
      email: ev.foundEmail?.toLowerCase() ?? null,
      name: ev.fullName ?? null,
      approvalStatus: "approved",
      source: "manual",
      removedByAdmin: false,
    })
    .onConflictDoUpdate({
      target: [eventAttendees.eventId, eventAttendees.lumaGuestApiId],
      set: {
        evaluationId: ev.id,
        approvalStatus: "approved",
        source: "manual",
        removedByAdmin: false,
        name: ev.fullName ?? null,
        updatedAt: sql`now()`,
      },
    });
  return { ok: true };
}

// ── Per-attendee scoring status ─────────────────────────────────────────────

export type AttendeeScoringStatus = "queued" | "scoring" | "complete" | "failed";

function mapItemStatus(s: string): AttendeeScoringStatus | null {
  if (s === "scoring" || s === "resolving") return "scoring";
  if (s === "pending" || s === "resolved") return "queued";
  if (s === "done" || s === "enriched") return "complete";
  if (s === "failed") return "failed";
  return null; // skipped/unknown → no chip
}

// Per-attendee scoring status keyed by eventAttendees.id, derived from the latest
// scoring_job_item linked to the attendee (by evaluationId for matched rows, else
// by linkedinUrl), scoped to jobs that are still active OR completed in the last
// 15 min — so chips reflect a CURRENT re-score, not ancient history.
export async function getAttendeeScoringStatuses(eventId: string): Promise<Record<string, AttendeeScoringStatus>> {
  const attendees = await db
    .select({ id: eventAttendees.id, evaluationId: eventAttendees.evaluationId, linkedinUrl: eventAttendees.linkedinUrl })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.removedByAdmin, false)));
  const evalIds = [...new Set(attendees.map((a) => a.evaluationId).filter((x): x is string => !!x))];
  const urls = [...new Set(attendees.map((a) => a.linkedinUrl).filter((x): x is string => !!x))];
  if (evalIds.length === 0 && urls.length === 0) return {};

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const matchConds = [
    evalIds.length ? inArray(scoringJobItems.evaluationId, evalIds) : null,
    urls.length ? inArray(scoringJobItems.linkedinUrl, urls) : null,
  ].filter(Boolean) as SQL[];
  const items = await db
    .select({
      evaluationId: scoringJobItems.evaluationId,
      linkedinUrl: scoringJobItems.linkedinUrl,
      status: scoringJobItems.status,
    })
    .from(scoringJobItems)
    .innerJoin(scoringJobs, eq(scoringJobs.id, scoringJobItems.jobId))
    .where(
      and(
        or(...matchConds),
        or(inArray(scoringJobs.status, ["queued", "running"]), gte(scoringJobs.completedAt, cutoff)),
      ),
    )
    .orderBy(asc(scoringJobItems.createdAt)); // asc → later rows overwrite = latest wins

  const byEval = new Map<string, AttendeeScoringStatus>();
  const byUrl = new Map<string, AttendeeScoringStatus>();
  for (const it of items) {
    const st = mapItemStatus(it.status);
    if (!st) continue;
    if (it.evaluationId) byEval.set(it.evaluationId, st);
    if (it.linkedinUrl) byUrl.set(it.linkedinUrl, st);
  }
  const out: Record<string, AttendeeScoringStatus> = {};
  for (const a of attendees) {
    const st = (a.evaluationId && byEval.get(a.evaluationId)) || (a.linkedinUrl && byUrl.get(a.linkedinUrl)) || null;
    if (st) out[a.id] = st;
  }
  return out;
}

// Soft-delete a person from this event, scoped to the event. A person can have
// both a Luma row and a manual row for the same evaluationId (the admin list
// dedupes them into one). Clicking Remove should remove the whole person, so we
// look up the target row's evaluationId and then soft-delete ALL rows sharing it.
// For unmatched name-only rows (evaluationId is null) we just soft-delete the
// one row by id. Returns false if no such row exists.
export async function removeAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  // Step 1: look up the target row to get its evaluationId.
  const [target] = await db
    .select({ evaluationId: eventAttendees.evaluationId })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.id, attendeeId), eq(eventAttendees.eventId, eventId)))
    .limit(1);
  if (!target) return false;

  if (target.evaluationId) {
    // Step 2a: matched row — soft-delete ALL rows for this person in this event
    // (covers both the Luma row and the manual row when both exist).
    await db
      .update(eventAttendees)
      .set({ removedByAdmin: true, updatedAt: sql`now()` })
      .where(
        and(
          eq(eventAttendees.eventId, eventId),
          eq(eventAttendees.evaluationId, target.evaluationId),
        ),
      );
  } else {
    // Step 2b: unmatched name-only row — soft-delete just this one row.
    await db
      .update(eventAttendees)
      .set({ removedByAdmin: true, updatedAt: sql`now()` })
      .where(and(eq(eventAttendees.id, attendeeId), eq(eventAttendees.eventId, eventId)));
  }

  return true;
}

// Best contact email per matched attendee, for the event email composer. An
// attendee's stored eventAttendees.email comes from Luma and is often blank
// (Luma doesn't share guest emails for hosts / some registrations). For a row
// matched to a real profile we fall back to that profile's email the same way
// the Claimed-Profiles list does: the claimer's Clerk login email first (the
// most reliable, e.g. the host themselves), then the best profile_emails row
// (verified before unverified). Returns evalId → email for those we can resolve.
export async function resolveAttendeeProfileEmails(evalIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(evalIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  // Per eval: the primary claimer's Clerk id (high-confidence, most recently
  // verified) and the best profile_emails fallback, in one round-trip.
  const res = await db.execute(sql`
    SELECT e.id::text AS eval_id,
      (SELECT u.clerk_user_id FROM users u
        WHERE u.evaluation_id = e.id AND u.clerk_user_id IS NOT NULL
        ORDER BY (u.match_confidence = 'high') DESC, u.verified_at DESC NULLS LAST
        LIMIT 1) AS clerk_user_id,
      (SELECT email FROM profile_emails pe WHERE pe.evaluation_id = e.id
        ORDER BY (status = 'verified') DESC, added_at ASC LIMIT 1) AS fallback_email
    FROM evaluations e
    WHERE e.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
  `);
  // db.execute returns either the rows array or a { rows } wrapper depending on
  // the driver — normalize (matches loadClaimedProfiles).
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<{
    eval_id: string;
    clerk_user_id: string | null;
    fallback_email: string | null;
  }>;

  // Batch-resolve claimer login emails from Clerk (chunked to its 100-id limit).
  const clerkIds = [...new Set(rows.map((r) => r.clerk_user_id).filter((x): x is string => !!x))];
  const emailByClerkId = new Map<string, string>();
  if (clerkIds.length) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const clerk = await clerkClient();
      for (let i = 0; i < clerkIds.length; i += 100) {
        const chunk = clerkIds.slice(i, i + 100);
        const res = await clerk.users.getUserList({ userId: chunk, limit: 100 });
        for (const u of res.data) {
          const email =
            u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
            u.emailAddresses[0]?.emailAddress;
          if (email) emailByClerkId.set(u.id, email);
        }
      }
    } catch {
      // Clerk lookup is best-effort — fall back to the DB profile_email per row.
    }
  }

  const out = new Map<string, string>();
  for (const r of rows) {
    const email = (r.clerk_user_id ? emailByClerkId.get(r.clerk_user_id) : undefined) ?? r.fallback_email ?? null;
    if (email) out.set(r.eval_id, email.toLowerCase());
  }
  return out;
}
