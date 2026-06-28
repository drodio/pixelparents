// Pull Luma guest lists for every Luma-sourced event and upsert them into
// event_attendees, matching each guest to a Founder Festival profile by email.
// Mirrors src/lib/luma-sync.ts (which syncs the events themselves). The Luma
// fetch is injectable so tests can run without hitting the network.

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, eventAttendees, evaluations, profileEmails } from "@/db/schema";
import { normalizeEmail } from "@/lib/profile-emails";
import { listLumaGuests, type LumaGuest } from "@/lib/luma";
import { lumaGuestToAttendeeValues } from "@/lib/event-attendees";

export type GuestFetcher = (eventApiId: string) => Promise<LumaGuest[]>;

// Resolve a guest email to a profile id. profile_emails is the canonical source
// (every row lowercased); evaluations.found_email (enrichment) is the fallback.
// Returns null when no profile matches.
export async function matchEvaluationIdByEmail(
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const norm = normalizeEmail(email);

  const [pe] = await db
    .select({ evaluationId: profileEmails.evaluationId })
    .from(profileEmails)
    .where(eq(profileEmails.email, norm))
    .limit(1);
  if (pe?.evaluationId) return pe.evaluationId;

  const [fe] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(sql`lower(${evaluations.foundEmail})`, norm))
    .limit(1);
  return fe?.id ?? null;
}

// Resolve a guest to a profile id: try email first, then fall back to LinkedIn URL.
// evaluations.linkedin_url is stored as https://linkedin.com/in/<handle> (canonicalized
// at scoring time); we match case-insensitively to handle any format variance.
export async function matchEvaluationId(
  email: string | null,
  linkedinUrl: string | null,
): Promise<string | null> {
  const byEmail = await matchEvaluationIdByEmail(email);
  if (byEmail) return byEmail;

  if (!linkedinUrl) return null;
  const [le] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(sql`lower(${evaluations.linkedinUrl})`, linkedinUrl.toLowerCase()))
    .limit(1);
  return le?.id ?? null;
}

export type AttendeeSyncResult = {
  events: number;
  attendees: number;
  matched: number;
  errors: number;
  toScoreLinkedinUrls: string[];
};

// For each Luma-sourced event, fetch its guests and upsert them. Idempotent:
// keyed on (event_id, luma_guest_api_id), re-syncs refresh status / check-in /
// profile match. Resilient per-event: if one event's guest fetch fails (e.g. a
// 403 for an event the calendar key can't read), it's logged and skipped so the
// rest still sync. Returns totals across all events plus an error count.
export async function syncEventAttendees(
  opts: { fetchGuests?: GuestFetcher } = {},
): Promise<AttendeeSyncResult> {
  const fetchGuests = opts.fetchGuests ?? listLumaGuests;

  const lumaEvents = await db
    .select({ id: events.id, lumaEventId: events.lumaEventId, lumaUrl: events.lumaUrl })
    .from(events)
    .where(and(eq(events.source, "luma"), isNotNull(events.lumaEventId)));

  let attendees = 0;
  let matched = 0;
  let errors = 0;
  const toScoreLinkedinUrls: string[] = [];

  for (const ev of lumaEvents) {
    if (!ev.lumaEventId) continue;
    let guests: LumaGuest[];
    try {
      guests = await fetchGuests(ev.lumaEventId);
    } catch (err) {
      errors++;
      console.error(
        `[event-attendees-sync] guest fetch failed for ${ev.lumaEventId}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    for (const g of guests) {
      const values = lumaGuestToAttendeeValues(g, { eventId: ev.id, lumaUrl: ev.lumaUrl });
      const evaluationId = await matchEvaluationId(values.email, values.linkedinUrl);
      if (evaluationId) {
        matched++;
      } else if (values.linkedinUrl) {
        toScoreLinkedinUrls.push(values.linkedinUrl);
      }
      attendees++;
      await db
        .insert(eventAttendees)
        .values({ ...values, evaluationId })
        .onConflictDoUpdate({
          target: [eventAttendees.eventId, eventAttendees.lumaGuestApiId],
          set: {
            evaluationId,
            email: values.email,
            name: values.name,
            linkedinUrl: values.linkedinUrl,
            approvalStatus: values.approvalStatus,
            registeredAt: values.registeredAt,
            checkedInAt: values.checkedInAt,
            lumaUserApiId: values.lumaUserApiId,
            lumaUrl: values.lumaUrl,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  return { events: lumaEvents.length, attendees, matched, errors, toScoreLinkedinUrls };
}
