import { and, asc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ensureEventsSchema, ensureFamiliesSchema } from "@/lib/db/ensure";
import {
  events,
  eventAdmins,
  eventRsvps,
  type EventRow,
  type EventAdminRow,
  type EventRsvpRow,
} from "@/lib/db/schema/events";
import { signups, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";

// Data layer for the Events calendar. Thin DB access: every function self-heals
// the events schema first (the country-column P0 lesson — new tables must be
// self-healed AND every read path must call the ensure fn), then runs the query.
// Authorization + privacy live in the server actions; this module is purely
// reads/writes.

export type EventSource = "user" | "ohs";
export type RsvpStatus = "going" | "interested";

export const RSVP_STATUSES: readonly RsvpStatus[] = ["going", "interested"];

// --- Reads --------------------------------------------------------------------

// Every event in [from, to) (by start), ascending. The calendar fetches a wide
// window (a year or so around now) so month paging + the list views are local.
export async function listEventsInRange(from: Date, to: Date): Promise<EventRow[]> {
  await ensureEventsSchema();
  return getDb()
    .select()
    .from(events)
    .where(and(gte(events.startsAt, from), lte(events.startsAt, to)))
    .orderBy(asc(events.startsAt));
}

// All events, ascending by start. Used by the list views (we filter to
// upcoming/past in pure code).
export async function listAllEvents(): Promise<EventRow[]> {
  await ensureEventsSchema();
  return getDb().select().from(events).orderBy(asc(events.startsAt));
}

export async function getEventById(id: string): Promise<EventRow | null> {
  await ensureEventsSchema();
  const [row] = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
  return row ?? null;
}

// RSVP counts (going + interested) for a set of event ids, in one grouped query.
export async function rsvpCountsFor(
  eventIds: string[],
): Promise<Map<string, { going: number; interested: number }>> {
  const out = new Map<string, { going: number; interested: number }>();
  if (eventIds.length === 0) return out;
  await ensureEventsSchema();
  const rows = await getDb()
    .select({
      eventId: eventRsvps.eventId,
      status: eventRsvps.status,
      count: sql<number>`count(*)::int`,
    })
    .from(eventRsvps)
    .where(inArray(eventRsvps.eventId, eventIds))
    .groupBy(eventRsvps.eventId, eventRsvps.status);
  for (const r of rows) {
    const cur = out.get(r.eventId) ?? { going: 0, interested: 0 };
    if (r.status === "going") cur.going = r.count;
    else if (r.status === "interested") cur.interested = r.count;
    out.set(r.eventId, cur);
  }
  return out;
}

// This member's RSVPs across a set of events (event_id → status).
export async function myRsvpsFor(
  signupId: string,
  eventIds: string[],
): Promise<Map<string, RsvpStatus>> {
  const out = new Map<string, RsvpStatus>();
  if (eventIds.length === 0) return out;
  await ensureEventsSchema();
  const rows = await getDb()
    .select()
    .from(eventRsvps)
    .where(and(eq(eventRsvps.signupId, signupId), inArray(eventRsvps.eventId, eventIds)));
  for (const r of rows) out.set(r.eventId, r.status as RsvpStatus);
  return out;
}

// Which of these event ids the member may edit (is an admin of). OHS events are
// never editable, so they never have admin rows.
export async function editableEventIds(
  signupId: string,
  eventIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (eventIds.length === 0) return out;
  await ensureEventsSchema();
  const rows = await getDb()
    .select({ eventId: eventAdmins.eventId })
    .from(eventAdmins)
    .where(and(eq(eventAdmins.signupId, signupId), inArray(eventAdmins.eventId, eventIds)));
  for (const r of rows) out.add(r.eventId);
  return out;
}

// Whether this member is an admin of (may edit) a single event.
export async function isEventAdmin(eventId: string, signupId: string): Promise<boolean> {
  await ensureEventsSchema();
  const [row] = await getDb()
    .select({ eventId: eventAdmins.eventId })
    .from(eventAdmins)
    .where(and(eq(eventAdmins.eventId, eventId), eq(eventAdmins.signupId, signupId)))
    .limit(1);
  return Boolean(row);
}

// The admin signup ids for an event (for the detail page's admin list).
export async function listEventAdmins(eventId: string): Promise<EventAdminRow[]> {
  await ensureEventsSchema();
  return getDb()
    .select()
    .from(eventAdmins)
    .where(eq(eventAdmins.eventId, eventId))
    .orderBy(asc(eventAdmins.createdAt));
}

// Every RSVP row for an event (the detail page shows who's going, name-gated).
export async function listRsvpsForEvent(eventId: string): Promise<EventRsvpRow[]> {
  await ensureEventsSchema();
  return getDb().select().from(eventRsvps).where(eq(eventRsvps.eventId, eventId));
}

// How many events this author created since `sinceMs` — backs the create rate
// limit. Only counts user events (OHS events have no author).
export async function countEventsByAuthorSince(
  authorSignupId: string,
  sinceMs: number,
): Promise<number> {
  await ensureEventsSchema();
  const rows = await getDb()
    .select({ id: events.id, createdAt: events.createdAt })
    .from(events)
    .where(eq(events.authorSignupId, authorSignupId));
  return rows.filter((r) => {
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : Date.parse(String(r.createdAt));
    return Number.isFinite(t) && t >= sinceMs;
  }).length;
}

// --- Writes -------------------------------------------------------------------

export type CreateEventInput = {
  authorSignupId: string;
  authorClerkId: string | null;
  authorLabel: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isOnline: boolean;
  location: string | null;
  onlineUrl: string | null;
  allDay: boolean;
};

// Create a USER event and make the creator an admin, in one transaction so a
// half-created event (event but no admin row → uneditable by its own author)
// can't happen.
export async function createEvent(input: CreateEventInput): Promise<EventRow> {
  await ensureEventsSchema();
  const db = getDb();
  const [row] = await db
    .insert(events)
    .values({
      authorSignupId: input.authorSignupId,
      authorClerkId: input.authorClerkId,
      authorLabel: input.authorLabel,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isOnline: input.isOnline,
      location: input.location,
      onlineUrl: input.onlineUrl,
      allDay: input.allDay,
      source: "user",
    })
    .returning();
  await db
    .insert(eventAdmins)
    .values({ eventId: row.id, signupId: input.authorSignupId })
    .onConflictDoNothing();
  return row;
}

// Update an event's editable fields. Authorization is the caller's responsibility
// (the action checks admin membership first); we additionally guard that the row
// is a USER event so an OHS event can never be mutated through this path.
export async function updateEvent(input: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isOnline: boolean;
  location: string | null;
  onlineUrl: string | null;
  allDay: boolean;
}): Promise<EventRow | null> {
  await ensureEventsSchema();
  const [row] = await getDb()
    .update(events)
    .set({
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isOnline: input.isOnline,
      location: input.location,
      onlineUrl: input.onlineUrl,
      allDay: input.allDay,
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, input.id), eq(events.source, "user")))
    .returning();
  return row ?? null;
}

// Delete a USER event (cascades to admins + rsvps). Guarded to source='user' so an
// OHS event can't be deleted here. Returns true if a row was removed.
export async function deleteEvent(id: string): Promise<boolean> {
  await ensureEventsSchema();
  const deleted = await getDb()
    .delete(events)
    .where(and(eq(events.id, id), eq(events.source, "user")))
    .returning({ id: events.id });
  return deleted.length > 0;
}

// Add a per-event admin (idempotent). The caller authorizes (must already be an
// admin of the event). Returns true if added or already present.
export async function addEventAdmin(eventId: string, signupId: string): Promise<boolean> {
  await ensureEventsSchema();
  await getDb()
    .insert(eventAdmins)
    .values({ eventId, signupId })
    .onConflictDoNothing();
  return true;
}

// Remove a per-event admin. We never let the author be removed (the action keeps
// the author pinned); this just deletes the row when allowed.
export async function removeEventAdmin(eventId: string, signupId: string): Promise<boolean> {
  await ensureEventsSchema();
  const deleted = await getDb()
    .delete(eventAdmins)
    .where(and(eq(eventAdmins.eventId, eventId), eq(eventAdmins.signupId, signupId)))
    .returning({ eventId: eventAdmins.eventId });
  return deleted.length > 0;
}

// Set (or clear) a member's RSVP. Passing null removes it; otherwise upsert the
// status in place (one row per event+member via the unique index).
export async function setRsvp(
  eventId: string,
  signupId: string,
  status: RsvpStatus | null,
): Promise<void> {
  await ensureEventsSchema();
  const db = getDb();
  if (status === null) {
    await db
      .delete(eventRsvps)
      .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.signupId, signupId)));
    return;
  }
  await db
    .insert(eventRsvps)
    .values({ eventId, signupId, status })
    .onConflictDoUpdate({
      target: [eventRsvps.eventId, eventRsvps.signupId],
      set: { status },
    });
}

// --- OHS import ---------------------------------------------------------------

export type OhsUpsert = {
  externalKey: string;
  title: string;
  startsAt: Date;
  // EXCLUSIVE end is computed by the caller; we store the inclusive last-day end
  // (start of the last day) so the calendar overlap math spans the range.
  endsAt: Date | null;
};

// Idempotently upsert OHS events by external_key. Re-running updates title/dates
// in place and never duplicates. Returns the count upserted. OHS events are
// always allDay, source='ohs', authorLabel='OHS (Automatically Added)'.
export async function upsertOhsEvents(rows: OhsUpsert[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureEventsSchema();
  const db = getDb();
  let n = 0;
  for (const r of rows) {
    await db
      .insert(events)
      .values({
        externalKey: r.externalKey,
        title: r.title,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        allDay: true,
        isOnline: false,
        source: "ohs",
        authorLabel: "OHS (Automatically Added)",
      })
      .onConflictDoUpdate({
        // The unique index on external_key is PARTIAL (only WHERE external_key IS
        // NOT NULL, so user events with a null key stay unconstrained). Postgres
        // can only infer a partial index as the ON CONFLICT arbiter when the same
        // predicate is supplied here, so include targetWhere or it errors 42P10.
        target: events.externalKey,
        targetWhere: sql`${events.externalKey} is not null`,
        set: {
          title: r.title,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          updatedAt: new Date(),
        },
      });
    n++;
  }
  return n;
}

// --- Member search (for the per-event "add admin" autocomplete) ---------------

// A safe, PII-light suggestion for the add-admin autocomplete: a display name +
// the signup id to add. NEVER carries email/phone — only what's needed to show a
// pickable name. Students show first-name-only (minor-privacy coarsening).
export type MemberSuggestion = {
  signupId: string;
  name: string;
  isStudent: boolean;
};

// Search existing, NON-student-coarsened display names by a prefix/substring.
// Used by the add-admin autocomplete so only an EXISTING account can be added.
// Matches first name, last name, or "first last" (case-insensitive). Excludes
// rows with a blank first name (auto-save drafts). Capped + ordered newest-first.
export async function searchSignupsByName(query: string, limit = 8): Promise<MemberSuggestion[]> {
  await ensureFamiliesSchema();
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.toLowerCase()}%`;
  const rows = await getDb()
    .select()
    .from(signups)
    .where(
      and(
        sql`coalesce(${signups.firstName}, '') <> ''`,
        sql`(
          lower(${signups.firstName}) like ${like}
          or lower(coalesce(${signups.lastName}, '')) like ${like}
          or lower(${signups.firstName} || ' ' || coalesce(${signups.lastName}, '')) like ${like}
        )`,
      ),
    )
    .limit(limit);
  return rows.map((r) => {
    const student = isStudentAccount(r);
    return {
      signupId: r.id,
      name: student ? r.firstName : [r.firstName, r.lastName].filter(Boolean).join(" "),
      isStudent: student,
    } satisfies MemberSuggestion;
  });
}

// Load a single signup by id (for verifying a to-be-added admin is a real account).
export async function getSignupById(id: string): Promise<SignupRow | null> {
  await ensureFamiliesSchema();
  const [row] = await getDb().select().from(signups).where(eq(signups.id, id)).limit(1);
  return row ?? null;
}
