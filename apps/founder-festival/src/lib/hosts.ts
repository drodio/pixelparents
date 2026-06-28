import { db } from "@/db";
import { hosts, eventHosts, hostProfiles, eventAttendees, evaluations, events } from "@/db/schema";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { computeCohortStats, type CohortStats } from "@/lib/event-analytics";
import { slugify } from "@/lib/slugify";

export type Host = typeof hosts.$inferSelect;

export type HostEventLink = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
};

// Non-draft events this host has hosted, newest first. Powers the "Events
// hosted" pills on the host index cards + the host profile page.
export async function getEventsForHost(hostId: string): Promise<HostEventLink[]> {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      status: events.status,
    })
    .from(eventHosts)
    .innerJoin(events, eq(events.id, eventHosts.eventId))
    .where(and(eq(eventHosts.hostId, hostId), ne(events.status, "draft")))
    .orderBy(desc(events.startsAt));
}

// The host's effective URL slug: the stored slug, else slugify(name). Used by
// the public /hosts/<slug> page and the host card links.
export function hostSlug(h: { slug: string | null; name: string }): string {
  return h.slug?.trim() || slugify(h.name);
}

// Resolve a /hosts/<slug> URL to a host: exact stored-slug match first, then
// fall back to a host whose slugify(name) matches (covers hosts with no stored
// slug). Null when nothing matches.
export async function getHostBySlug(slug: string): Promise<Host | null> {
  const [exact] = await db.select().from(hosts).where(eq(hosts.slug, slug)).limit(1);
  if (exact) return exact;
  const all = await db.select().from(hosts);
  return all.find((h) => !h.slug && slugify(h.name) === slug) ?? null;
}

// Is `slug` already used by a DIFFERENT host (stored slug, or name-derived)?
// Powers the admin save's uniqueness check so two hosts can't share a URL.
export async function isHostSlugTaken(slug: string, exceptId: string): Promise<boolean> {
  const all = await db.select().from(hosts);
  return all.some((h) => h.id !== exceptId && hostSlug(h) === slug);
}
export type HostProfile = {
  evaluationId: string;
  fullName: string | null;
  slug: string | null;
  slugKind: string | null;
};

export async function listHosts(): Promise<Host[]> {
  return db.select().from(hosts).orderBy(asc(hosts.name));
}

export async function getHostById(id: string): Promise<Host | null> {
  const [row] = await db.select().from(hosts).where(eq(hosts.id, id)).limit(1);
  return row ?? null;
}

export async function createHost(values: {
  name: string;
  blurb?: string | null;
  iconUrl?: string | null;
  url?: string | null;
  slug?: string | null;
}): Promise<Host> {
  const [row] = await db
    .insert(hosts)
    .values({
      name: values.name,
      blurb: values.blurb ?? null,
      iconUrl: values.iconUrl ?? null,
      url: values.url ?? null,
      // Default the slug from the name so new hosts get a stable URL immediately.
      slug: values.slug?.trim() || slugify(values.name),
    })
    .returning();
  return row;
}

export async function updateHost(
  id: string,
  values: Partial<{ name: string; blurb: string | null; iconUrl: string | null; url: string | null; slug: string | null }>,
): Promise<Host | null> {
  const [row] = await db
    .update(hosts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(hosts.id, id))
    .returning();
  return row ?? null;
}

export async function deleteHost(id: string): Promise<void> {
  await db.delete(hosts).where(eq(hosts.id, id));
}

// Hosts attached to one event, in display order.
export async function getHostsForEvent(eventId: string): Promise<Host[]> {
  const rows = await db
    .select({ host: hosts, sortOrder: eventHosts.sortOrder })
    .from(eventHosts)
    .innerJoin(hosts, eq(eventHosts.hostId, hosts.id))
    .where(eq(eventHosts.eventId, eventId))
    .orderBy(asc(eventHosts.sortOrder), asc(hosts.name));
  return rows.map((r) => r.host);
}

// Replace an event's host associations with the given set (order = array order).
export async function setEventHosts(eventId: string, hostIds: string[]): Promise<void> {
  await db.delete(eventHosts).where(eq(eventHosts.eventId, eventId));
  if (hostIds.length === 0) return;
  await db.insert(eventHosts).values(hostIds.map((hostId, i) => ({ eventId, hostId, sortOrder: i })));
}

// Events a host has hosted (ids).
async function hostEventIds(hostId: string): Promise<string[]> {
  const rows = await db
    .select({ eventId: eventHosts.eventId })
    .from(eventHosts)
    .where(eq(eventHosts.hostId, hostId));
  return rows.map((r) => r.eventId);
}

export type HostStats = {
  eventCount: number;
  totalAttendees: number;
  stats: CohortStats;
};

// Aggregate stats across ALL of a host's events: total approved attendees and
// average founder/investor scores over matched, scored attendees.
export async function getHostStats(hostId: string): Promise<HostStats> {
  const eventIds = await hostEventIds(hostId);
  if (eventIds.length === 0) {
    return { eventCount: 0, totalAttendees: 0, stats: computeCohortStats([]) };
  }
  const rows = await db
    .select({
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      signalQuality: evaluations.signalQuality,
    })
    .from(eventAttendees)
    .innerJoin(evaluations, eq(eventAttendees.evaluationId, evaluations.id))
    .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.approvalStatus, "approved")));

  const totalRows = await db
    .select({ id: eventAttendees.id })
    .from(eventAttendees)
    .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.approvalStatus, "approved")));

  const scored = rows.filter((r) => r.signalQuality !== "low");
  return {
    eventCount: eventIds.length,
    totalAttendees: totalRows.length,
    stats: computeCohortStats(scored),
  };
}

// Profiles associated with a host (people who work there) — shown beneath the
// host on the public recap, mirroring sponsor people. Managed via the admin
// search picker (attach by evaluation id).
export async function getHostProfiles(hostId: string): Promise<HostProfile[]> {
  const rows = await db
    .select({
      evaluationId: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      sortOrder: hostProfiles.sortOrder,
    })
    .from(hostProfiles)
    .innerJoin(evaluations, eq(hostProfiles.evaluationId, evaluations.id))
    .where(eq(hostProfiles.hostId, hostId))
    .orderBy(asc(hostProfiles.sortOrder), asc(evaluations.fullName));
  return rows.map(({ sortOrder: _o, ...r }) => r);
}

export async function attachHostProfileById(
  hostId: string,
  evaluationId: string,
): Promise<HostProfile | null> {
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, slug: evaluations.slug, slugKind: evaluations.slugKind })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev) return null;
  await db.insert(hostProfiles).values({ hostId, evaluationId: ev.id }).onConflictDoNothing();
  return { evaluationId: ev.id, fullName: ev.fullName, slug: ev.slug, slugKind: ev.slugKind };
}

export async function detachHostProfile(hostId: string, evaluationId: string): Promise<void> {
  await db
    .delete(hostProfiles)
    .where(and(eq(hostProfiles.hostId, hostId), eq(hostProfiles.evaluationId, evaluationId)));
}

// A host's attached people as full leaderboard rows (name, company, scores,
// badges) — for the recap's mini leaderboard-style host table, mirroring
// getSponsorPeopleRows. Sorted by combined score desc. Dynamic import avoids a
// load-order cycle with leaderboard.ts.
export async function getHostPeopleRows(
  hostId: string,
): Promise<import("@/lib/leaderboard").LeaderboardRow[]> {
  const people = await getHostProfiles(hostId);
  const ids = people.map((p) => p.evaluationId);
  if (ids.length === 0) return [];
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const rows = await getLeaderboardRowsForEvalIds(ids);
  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return rows;
}
