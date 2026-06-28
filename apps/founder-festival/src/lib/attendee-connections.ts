import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  evaluations,
  eventAttendees,
  connectionRequests,
  connectionPreferences,
  eventContactSharing,
  eventSponsors,
  sponsorProfiles,
  events,
  profileEmails,
} from "@/db/schema";
import { sendConnectionIntroEmail } from "@/lib/email";
import { getProfileDossier, isDossierViewable } from "@/lib/profile-dossier";
import { logMemberMessage } from "@/lib/event-email-send";
import { classifyRole } from "@/lib/event-analytics";
import type { LeaderboardRow } from "@/lib/leaderboard";

export type RequesterGroup = "founder" | "investor" | "sponsor";
export type PrefAction = "auto_approve" | "auto_deny" | "ask";
export type ContactMode = "open_to_all" | "by_request";

export type PrefRow = { scope: string; group: string; action: string };

// Resolve the auto-handling action for an incoming request, given the target's
// preference rows, the requester's group, and the event. Event-specific scope
// (scope === eventId) wins over "global"; otherwise default to "ask".
export function resolveAutoAction(
  prefs: PrefRow[],
  group: RequesterGroup,
  eventId: string,
): PrefAction {
  const forGroup = prefs.filter((p) => p.group === group);
  const evt = forGroup.find((p) => p.scope === eventId);
  if (evt && (evt.action === "auto_approve" || evt.action === "auto_deny")) return evt.action;
  const glob = forGroup.find((p) => p.scope === "global");
  if (glob && (glob.action === "auto_approve" || glob.action === "auto_deny")) return glob.action;
  return "ask";
}

// The requester's group relative to an event: "sponsor" if they're attached to a
// sponsor of this event, else by canonical role.
export async function requesterGroup(eventId: string, fromEvalId: string): Promise<RequesterGroup> {
  const [sp] = await db
    .select({ id: sponsorProfiles.id })
    .from(sponsorProfiles)
    .innerJoin(eventSponsors, eq(eventSponsors.sponsorId, sponsorProfiles.sponsorId))
    .where(and(eq(eventSponsors.eventId, eventId), eq(sponsorProfiles.evaluationId, fromEvalId)))
    .limit(1);
  if (sp) return "sponsor";
  const [ev] = await db
    .select({ founderScore: evaluations.founderScore, investorScore: evaluations.investorScore })
    .from(evaluations)
    .where(eq(evaluations.id, fromEvalId))
    .limit(1);
  if (!ev) return "founder";
  return classifyRole(ev);
}

export async function getConnectionPreferences(evaluationId: string): Promise<PrefRow[]> {
  return db
    .select({ scope: connectionPreferences.scope, group: connectionPreferences.group, action: connectionPreferences.action })
    .from(connectionPreferences)
    .where(eq(connectionPreferences.evaluationId, evaluationId));
}

export async function setConnectionPreference(
  evaluationId: string,
  scope: string,
  group: RequesterGroup,
  action: PrefAction,
): Promise<void> {
  await db
    .insert(connectionPreferences)
    .values({ evaluationId, scope, group, action })
    .onConflictDoUpdate({
      target: [connectionPreferences.evaluationId, connectionPreferences.scope, connectionPreferences.group],
      set: { action, updatedAt: new Date() },
    });
}

// The three requester groups a preference applies to. The simplified UI sets one
// choice that we fan out across all three.
export const CONNECTION_GROUPS: RequesterGroup[] = ["founder", "investor", "sponsor"];

// Simple per-scope connection choice ("Allow event connection requests?"):
//   auto_approve = Auto-accept all · ask = Review requests · auto_deny = Don't accept
// Writes the same action for every requester group at the scope (event id or "global").
export async function setConnectionChoice(evaluationId: string, scope: string, choice: PrefAction): Promise<void> {
  for (const group of CONNECTION_GROUPS) {
    await setConnectionPreference(evaluationId, scope, group, choice);
  }
}

// The single choice for a scope. We always write all groups together, so any row
// at that scope reflects the choice; default "ask" (Review requests).
export function connectionChoiceForScope(prefs: PrefRow[], scope: string): PrefAction {
  const row = prefs.find((p) => p.scope === scope);
  if (row && (row.action === "auto_approve" || row.action === "auto_deny" || row.action === "ask")) return row.action;
  return "ask";
}

export async function getContactSharingMode(eventId: string, evaluationId: string): Promise<ContactMode> {
  const [row] = await db
    .select({ mode: eventContactSharing.mode })
    .from(eventContactSharing)
    .where(and(eq(eventContactSharing.eventId, eventId), eq(eventContactSharing.evaluationId, evaluationId)))
    .limit(1);
  return (row?.mode as ContactMode) ?? "by_request";
}

export async function setContactSharingMode(eventId: string, evaluationId: string, mode: ContactMode): Promise<void> {
  await db
    .insert(eventContactSharing)
    .values({ eventId, evaluationId, mode })
    .onConflictDoUpdate({
      target: [eventContactSharing.eventId, eventContactSharing.evaluationId],
      set: { mode, updatedAt: new Date() },
    });
}

export type ConnectionRow = typeof connectionRequests.$inferSelect;

// Create (or return existing) a connection request. Applies the target's
// auto-handling preferences: auto_approve / auto_deny short-circuit straight to
// a decided state; otherwise the request is pending.
export async function createConnectionRequest(
  eventId: string,
  fromEvalId: string,
  toEvalId: string,
): Promise<{ request: ConnectionRow; autoResolved: PrefAction }> {
  if (fromEvalId === toEvalId) throw new Error("cannot connect to yourself");

  const [existing] = await db
    .select()
    .from(connectionRequests)
    .where(
      and(
        eq(connectionRequests.eventId, eventId),
        eq(connectionRequests.fromEvaluationId, fromEvalId),
        eq(connectionRequests.toEvaluationId, toEvalId),
      ),
    )
    .limit(1);
  if (existing) return { request: existing, autoResolved: "ask" };

  const group = await requesterGroup(eventId, fromEvalId);
  const prefs = await getConnectionPreferences(toEvalId);
  const auto = resolveAutoAction(prefs, group, eventId);
  const status = auto === "auto_approve" ? "approved" : auto === "auto_deny" ? "denied" : "pending";

  const [request] = await db
    .insert(connectionRequests)
    .values({
      eventId,
      fromEvaluationId: fromEvalId,
      toEvaluationId: toEvalId,
      status,
      token: randomUUID(),
      decidedAt: status === "pending" ? null : new Date(),
    })
    .returning();
  return { request, autoResolved: auto };
}

// Approve/deny a request. Only the target (toEvaluationId) may decide.
export async function decideConnectionRequest(
  requestId: string,
  byEvalId: string,
  decision: "approved" | "denied",
): Promise<ConnectionRow | null> {
  const [req] = await db.select().from(connectionRequests).where(eq(connectionRequests.id, requestId)).limit(1);
  if (!req || req.toEvaluationId !== byEvalId) return null;
  const [row] = await db
    .update(connectionRequests)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(connectionRequests.id, requestId), eq(connectionRequests.status, "pending")))
    .returning();
  return row ?? null;
}

// Remove the connection between two attendees at an event — the "Disconnect"
// action. Deletes the request row in EITHER direction so a fresh "Connect"
// (which inserts from=viewer→other) can be made again afterward.
export async function removeConnection(
  eventId: string,
  evalA: string,
  evalB: string,
): Promise<void> {
  await db.delete(connectionRequests).where(
    and(
      eq(connectionRequests.eventId, eventId),
      or(
        and(eq(connectionRequests.fromEvaluationId, evalA), eq(connectionRequests.toEvaluationId, evalB)),
        and(eq(connectionRequests.fromEvaluationId, evalB), eq(connectionRequests.toEvaluationId, evalA)),
      ),
    ),
  );
}

// Decide by token (for email links). Returns the row if the token matched.
export async function decideConnectionRequestByToken(
  token: string,
  decision: "approved" | "denied",
): Promise<ConnectionRow | null> {
  const [row] = await db
    .update(connectionRequests)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(connectionRequests.token, token), eq(connectionRequests.status, "pending")))
    .returning();
  return row ?? null;
}

// Email a double-opt-in introduction to BOTH people in an approved connection.
// Best-effort: callers wrap in try/catch so a mail failure never blocks the
// approval. Skips silently (logs) if either person has no resolvable email.
export async function introduceConnection(
  row: { fromEvaluationId: string; toEvaluationId: string; eventId: string },
  origin: string,
): Promise<void> {
  const [ev] = await db
    .select({ title: events.title, slug: events.slug, startsAt: events.startsAt })
    .from(events)
    .where(eq(events.id, row.eventId))
    .limit(1);
  if (!ev) return;

  const people = await db
    .select({
      evaluationId: evaluations.id,
      fullName: evaluations.fullName,
      // Preferred display name (e.g. "DROdio") when the owner set one.
      nickname: sql<string | null>`(select nickname from users u where u.evaluation_id = ${evaluations.id} and u.nickname is not null limit 1)`,
      // Profile title shown after the name in the intro bullets.
      credibilityTitle: evaluations.credibilityTitle,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      foundEmail: evaluations.foundEmail,
      attendeeEmail: eventAttendees.email,
    })
    .from(evaluations)
    .leftJoin(
      eventAttendees,
      and(eq(eventAttendees.evaluationId, evaluations.id), eq(eventAttendees.eventId, row.eventId)),
    )
    .where(inArray(evaluations.id, [row.fromEvaluationId, row.toEvaluationId]));

  const from = people.find((p) => p.evaluationId === row.fromEvaluationId);
  const to = people.find((p) => p.evaluationId === row.toEvaluationId);
  if (!from || !to) return;

  // Resolve a reachable email per person: their attendee email, else the scored
  // foundEmail, else any email on their profile (verified preferred). The last
  // fallback matters because manually-added attendees often have no email on the
  // attendee row, which previously silently skipped the whole intro.
  async function profileEmail(evaluationId: string): Promise<string | null> {
    const rows = await db
      .select({ email: profileEmails.email, status: profileEmails.status })
      .from(profileEmails)
      .where(eq(profileEmails.evaluationId, evaluationId));
    if (rows.length === 0) return null;
    const verified = rows.find((r) => r.status === "verified");
    return (verified?.email ?? rows[0]!.email)?.trim().toLowerCase() ?? null;
  }

  const emailFrom =
    (from.attendeeEmail ?? from.foundEmail)?.trim().toLowerCase() ??
    (await profileEmail(from.evaluationId));
  const emailTo =
    (to.attendeeEmail ?? to.foundEmail)?.trim().toLowerCase() ??
    (await profileEmail(to.evaluationId));
  if (!emailFrom || !emailTo) {
    console.warn(
      `[introduceConnection] missing email; skipping intro for event ${row.eventId} (from=${!!emailFrom}, to=${!!emailTo})`,
    );
    return;
  }
  const toEmails = [...new Set([emailFrom, emailTo])];

  const profilePath = (p: { evaluationId: string; slug: string | null; slugKind: string | null }) =>
    p.slug && p.slugKind ? `/profile/${p.slugKind}/${p.slug}` : `/profile?e=${p.evaluationId}`;

  const dateStr = ev.startsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const nameA = from.nickname ?? from.fullName ?? "A fellow attendee";
  const nameB = to.nickname ?? to.fullName ?? "A fellow attendee";
  // Link to each person's dossier only when a ready one exists.
  const [dossierFrom, dossierTo] = await Promise.all([
    getProfileDossier(from.evaluationId),
    getProfileDossier(to.evaluationId),
  ]);
  await sendConnectionIntroEmail({
    toEmails,
    nameA,
    nameB,
    eventTitle: ev.title,
    eventUrl: `${origin}/events/${ev.slug}`,
    dateStr,
    profileUrlA: `${origin}${profilePath(from)}`,
    profileUrlB: `${origin}${profilePath(to)}`,
    titleA: from.credibilityTitle,
    titleB: to.credibilityTitle,
    dossierUrlA: isDossierViewable(dossierFrom) ? dossierFrom.shareUrl : undefined,
    dossierUrlB: isDossierViewable(dossierTo) ? dossierTo.shareUrl : undefined,
  });

  // Surface the intro in both members' /account → Messages inbox (best-effort).
  // Mirrors the subject built in buildConnectionIntroEmail.
  const introSubject = `Festival: Connecting ${nameA} ←→ ${nameB} from ${ev.title} on ${dateStr}`;
  const introBody = `${nameA} and ${nameB} were introduced at ${ev.title} (${dateStr}).\n\n${nameA}: ${origin}${profilePath(from)}\n${nameB}: ${origin}${profilePath(to)}`;
  await logMemberMessage({
    toEvaluationId: from.evaluationId,
    toEmail: emailFrom,
    fromAddress: "Founder Festival <hello@festival.so>",
    type: "connection_intro",
    subject: introSubject,
    body: introBody,
    eventId: row.eventId,
  });
  await logMemberMessage({
    toEvaluationId: to.evaluationId,
    toEmail: emailTo,
    fromAddress: "Founder Festival <hello@festival.so>",
    type: "connection_intro",
    subject: introSubject,
    body: introBody,
    eventId: row.eventId,
  });
}

// Read-only lookup of a request by its email token, with the requester's name —
// used to render the approve/deny landing-page heading ("Approve <Name>'s
// Connection Request"). Does NOT mutate; returns null if the token is unknown.
export async function getConnectionRequestByToken(
  token: string,
): Promise<{ fromName: string | null; fromEvaluationId: string; status: string } | null> {
  const [row] = await db
    .select({
      // Preferred display name (nickname, e.g. "DROdio") when set, else full name.
      fromName: sql<string | null>`coalesce((select nickname from users u where u.evaluation_id = ${connectionRequests.fromEvaluationId} and u.nickname is not null limit 1), ${evaluations.fullName})`,
      fromEvaluationId: connectionRequests.fromEvaluationId,
      status: connectionRequests.status,
    })
    .from(connectionRequests)
    .innerJoin(evaluations, eq(evaluations.id, connectionRequests.fromEvaluationId))
    .where(eq(connectionRequests.token, token))
    .limit(1);
  return row ?? null;
}

export type DirectoryEntry = {
  evaluationId: string;
  fullName: string | null;
  role: RequesterGroup;
  profileHref: string | null;
  contactMode: ContactMode;
  connectionStatus: "none" | "pending_out" | "pending_in" | "approved" | "denied";
  // contact revealed only when the other person is open_to_all; approved connections are introduced over email instead
  contact: { email: string | null; linkedin: string | null } | null;
  // Full leaderboard data (company, badges, scores, avatar) for leaderboard-
  // style rendering. null for low-signal evals that don't appear on the board.
  lb: LeaderboardRow | null;
};

// The attendee directory for an event from the viewer's perspective: every other
// approved+matched attendee, with their role, contact-sharing mode, the viewer's
// connection state with them, and contact info when visible.
export async function getEventDirectory(eventId: string, viewerEvalId: string): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({
      evaluationId: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      linkedin: evaluations.linkedinUrl,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      attendeeEmail: eventAttendees.email,
    })
    .from(eventAttendees)
    .innerJoin(evaluations, eq(eventAttendees.evaluationId, evaluations.id))
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.approvalStatus, "approved"),
        ne(evaluations.id, viewerEvalId),
      ),
    );

  const otherIds = rows.map((r) => r.evaluationId);
  if (otherIds.length === 0) return [];

  // sharing modes
  const sharing = await db
    .select({ evaluationId: eventContactSharing.evaluationId, mode: eventContactSharing.mode })
    .from(eventContactSharing)
    .where(and(eq(eventContactSharing.eventId, eventId), inArray(eventContactSharing.evaluationId, otherIds)));
  const modeByEval = new Map(sharing.map((s) => [s.evaluationId, s.mode as ContactMode]));

  // sponsor members of this event (for role=sponsor)
  const sponsorMembers = await db
    .select({ evaluationId: sponsorProfiles.evaluationId })
    .from(sponsorProfiles)
    .innerJoin(eventSponsors, eq(eventSponsors.sponsorId, sponsorProfiles.sponsorId))
    .where(eq(eventSponsors.eventId, eventId));
  const sponsorSet = new Set(sponsorMembers.map((s) => s.evaluationId));

  // connection state between viewer and each other attendee (either direction)
  const conns = await db
    .select()
    .from(connectionRequests)
    .where(
      and(
        eq(connectionRequests.eventId, eventId),
        or(
          eq(connectionRequests.fromEvaluationId, viewerEvalId),
          eq(connectionRequests.toEvaluationId, viewerEvalId),
        ),
      ),
    );

  const built = rows
    .map((r) => {
      const mode = modeByEval.get(r.evaluationId) ?? "by_request";
      const role: RequesterGroup = sponsorSet.has(r.evaluationId)
        ? "sponsor"
        : classifyRole({ founderScore: r.founderScore, investorScore: r.investorScore });
      const conn = conns.find(
        (c) =>
          (c.fromEvaluationId === viewerEvalId && c.toEvaluationId === r.evaluationId) ||
          (c.toEvaluationId === viewerEvalId && c.fromEvaluationId === r.evaluationId),
      );
      let connectionStatus: DirectoryEntry["connectionStatus"] = "none";
      if (conn) {
        if (conn.status === "approved") connectionStatus = "approved";
        else if (conn.status === "denied") connectionStatus = "denied";
        else connectionStatus = conn.fromEvaluationId === viewerEvalId ? "pending_out" : "pending_in";
      }
      const reveal = mode === "open_to_all";
      return {
        evaluationId: r.evaluationId,
        fullName: r.fullName,
        role,
        profileHref: r.slug && r.slugKind ? `/profile/${r.slugKind}/${r.slug}` : null,
        contactMode: mode,
        connectionStatus,
        contact: reveal ? { email: r.attendeeEmail, linkedin: r.linkedin } : null,
      };
    });

  // Enrich with full leaderboard rows (company, badges, scores, avatar) so the
  // directory renders leaderboard-style. Low-signal evals have no lb row → null.
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const lbRows = built.length ? await getLeaderboardRowsForEvalIds(built.map((b) => b.evaluationId)) : [];
  const lbById = new Map(lbRows.map((r) => [r.id, r]));

  return built
    .map((b) => ({ ...b, lb: lbById.get(b.evaluationId) ?? null }))
    .sort(
      (a, b) =>
        (b.lb?.combinedScore ?? -1) - (a.lb?.combinedScore ?? -1) ||
        (a.fullName ?? "").localeCompare(b.fullName ?? ""),
    );
}

// Pending incoming requests for the viewer at an event, with requester display.
export async function listIncomingRequests(eventId: string, toEvalId: string) {
  return db
    .select({
      id: connectionRequests.id,
      fromEvaluationId: connectionRequests.fromEvaluationId,
      fromName: sql<string | null>`coalesce((select nickname from users u where u.evaluation_id = ${connectionRequests.fromEvaluationId} and u.nickname is not null limit 1), ${evaluations.fullName})`,
      createdAt: connectionRequests.createdAt,
    })
    .from(connectionRequests)
    .innerJoin(evaluations, eq(connectionRequests.fromEvaluationId, evaluations.id))
    .where(
      and(
        eq(connectionRequests.eventId, eventId),
        eq(connectionRequests.toEvaluationId, toEvalId),
        eq(connectionRequests.status, "pending"),
      ),
    )
    .orderBy(sql`${connectionRequests.createdAt} desc`);
}
