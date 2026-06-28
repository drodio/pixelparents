import { desc, eq, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { memberMessages, events } from "@/db/schema";

// The member-facing message inbox shown on /account ("Messages"). Forward-only:
// every event blast + connection request + other member-facing email we logged
// via logMemberMessage. Matched to the viewer by clerk id OR (for messages logged
// before they claimed) their evaluation id.

export type MemberMessageRow = {
  id: string;
  subject: string;
  body: string;
  fromAddress: string;
  type: string;
  sentAt: string;
  eventId: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
};

export async function listMemberMessagesForViewer(opts: {
  clerkUserId: string | null;
  evaluationId: string | null;
}): Promise<MemberMessageRow[]> {
  const conds: SQL[] = [];
  if (opts.clerkUserId) conds.push(eq(memberMessages.clerkUserId, opts.clerkUserId));
  if (opts.evaluationId) conds.push(eq(memberMessages.toEvaluationId, opts.evaluationId));
  if (conds.length === 0) return [];

  try {
    const rows = await db
      .select({
        id: memberMessages.id,
        subject: memberMessages.subject,
        body: memberMessages.body,
        fromAddress: memberMessages.fromAddress,
        type: memberMessages.type,
        sentAt: memberMessages.sentAt,
        eventId: memberMessages.eventId,
        eventTitle: events.title,
        eventSlug: events.slug,
      })
      .from(memberMessages)
      .leftJoin(events, eq(events.id, memberMessages.eventId))
      .where(conds.length === 1 ? conds[0] : or(...conds))
      .orderBy(desc(memberMessages.sentAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      body: r.body,
      fromAddress: r.fromAddress,
      type: r.type,
      sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : String(r.sentAt),
      eventId: r.eventId,
      eventTitle: r.eventTitle,
      eventSlug: r.eventSlug,
    }));
  } catch {
    // Deploy-safe: table may not exist yet on a stale DB → no inbox rather than 500.
    return [];
  }
}
