import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  eventAttendees,
  hostProfiles,
  eventHosts,
  sponsorProfiles,
  eventSponsors,
} from "@/db/schema";

// The current viewer's claimed evaluation id (their Founder Festival profile),
// or null if not signed in / unclaimed. Works on public routes because Clerk
// middleware (src/proxy.ts) covers them even though Clerk JS isn't mounted.
export async function getViewerEvaluationId(): Promise<string | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;
  const [row] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  return row?.evaluationId ?? null;
}

// The attendee gate: is this profile an approved RSVP for the event — OR one of
// its hosts/sponsors? Hosts and sponsors are treated as attendees for ACCESS:
// when logged in they see everything an attendee sees (attendee-only photos,
// learnings, the attendee hub, attendees-only chat) and can post/connect.
//
// They are NOT added to the attendee list or capacity counts — those query
// eventAttendees directly. The host/sponsor link is their claimed profile being
// attached to a host/sponsor of the event (hostProfiles / sponsorProfiles).
export async function isEventAttendee(eventId: string, evaluationId: string | null): Promise<boolean> {
  if (!evaluationId) return false;

  const [attendee] = await db
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.evaluationId, evaluationId),
        eq(eventAttendees.approvalStatus, "approved"),
      ),
    )
    .limit(1);
  if (attendee) return true;

  const [host] = await db
    .select({ id: hostProfiles.id })
    .from(hostProfiles)
    .innerJoin(eventHosts, eq(eventHosts.hostId, hostProfiles.hostId))
    .where(and(eq(eventHosts.eventId, eventId), eq(hostProfiles.evaluationId, evaluationId)))
    .limit(1);
  if (host) return true;

  const [sponsor] = await db
    .select({ id: sponsorProfiles.id })
    .from(sponsorProfiles)
    .innerJoin(eventSponsors, eq(eventSponsors.sponsorId, sponsorProfiles.sponsorId))
    .where(and(eq(eventSponsors.eventId, eventId), eq(sponsorProfiles.evaluationId, evaluationId)))
    .limit(1);
  return !!sponsor;
}

// Convenience for pages: resolve viewer + attendee status in one call.
export async function getViewerAttendeeContext(
  eventId: string,
): Promise<{ evaluationId: string | null; isAttendee: boolean }> {
  const evaluationId = await getViewerEvaluationId();
  const attendee = await isEventAttendee(eventId, evaluationId);
  return { evaluationId, isAttendee: attendee };
}
