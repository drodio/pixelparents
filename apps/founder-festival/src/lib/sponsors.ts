import { db } from "@/db";
import { sponsors, eventSponsors, sponsorProfiles, evaluations, events } from "@/db/schema";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { slugify } from "@/lib/slugify";

export type Sponsor = typeof sponsors.$inferSelect;

// Sponsors have no slug column — the public /sponsors/<slug> URL is derived from
// the name (first match wins on a rare collision).
export function sponsorSlug(s: { name: string }): string {
  return slugify(s.name);
}

export type SponsorEventLink = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
};

// Non-draft events this sponsor has sponsored, newest first.
export async function getEventsForSponsor(sponsorId: string): Promise<SponsorEventLink[]> {
  return db
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      status: events.status,
    })
    .from(eventSponsors)
    .innerJoin(events, eq(events.id, eventSponsors.eventId))
    .where(and(eq(eventSponsors.sponsorId, sponsorId), ne(events.status, "draft")))
    .orderBy(desc(events.startsAt));
}
export type SponsorProfile = {
  evaluationId: string;
  fullName: string | null;
  slug: string | null;
  slugKind: string | null;
};

export async function listSponsors(): Promise<Sponsor[]> {
  return db.select().from(sponsors).orderBy(asc(sponsors.name));
}

export async function getSponsorById(id: string): Promise<Sponsor | null> {
  const [row] = await db.select().from(sponsors).where(eq(sponsors.id, id)).limit(1);
  return row ?? null;
}

export async function createSponsor(values: {
  name: string;
  blurb?: string | null;
  websiteUrl?: string | null;
}): Promise<Sponsor> {
  const [row] = await db
    .insert(sponsors)
    .values({ name: values.name, blurb: values.blurb ?? null, websiteUrl: values.websiteUrl ?? null })
    .returning();
  return row;
}

export async function updateSponsor(
  id: string,
  values: Partial<{ name: string; blurb: string | null; logoUrl: string | null; websiteUrl: string | null }>,
): Promise<Sponsor | null> {
  const [row] = await db
    .update(sponsors)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(sponsors.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSponsor(id: string): Promise<void> {
  await db.delete(sponsors).where(eq(sponsors.id, id));
}

export async function getSponsorsForEvent(eventId: string): Promise<Sponsor[]> {
  const rows = await db
    .select({ sponsor: sponsors })
    .from(eventSponsors)
    .innerJoin(sponsors, eq(eventSponsors.sponsorId, sponsors.id))
    .where(eq(eventSponsors.eventId, eventId))
    .orderBy(asc(eventSponsors.sortOrder), asc(sponsors.name));
  return rows.map((r) => r.sponsor);
}

export async function setEventSponsors(eventId: string, sponsorIds: string[]): Promise<void> {
  await db.delete(eventSponsors).where(eq(eventSponsors.eventId, eventId));
  if (sponsorIds.length === 0) return;
  await db.insert(eventSponsors).values(sponsorIds.map((sponsorId, i) => ({ eventId, sponsorId, sortOrder: i })));
}

// Profiles attached to a sponsor, with the bits needed to render a public link.
export async function getSponsorProfiles(sponsorId: string): Promise<SponsorProfile[]> {
  const rows = await db
    .select({
      evaluationId: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      sortOrder: sponsorProfiles.sortOrder,
    })
    .from(sponsorProfiles)
    .innerJoin(evaluations, eq(sponsorProfiles.evaluationId, evaluations.id))
    .where(eq(sponsorProfiles.sponsorId, sponsorId))
    .orderBy(asc(sponsorProfiles.sortOrder), asc(evaluations.fullName));
  return rows.map(({ sortOrder: _o, ...r }) => r);
}

function normalizeLinkedin(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

// Attach a profile to a sponsor by LinkedIn URL. Returns the attached profile,
// or null if no evaluation matches that URL.
export async function attachSponsorProfileByLinkedin(
  sponsorId: string,
  linkedinUrl: string,
): Promise<SponsorProfile | null> {
  const norm = normalizeLinkedin(linkedinUrl);
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, slug: evaluations.slug, slugKind: evaluations.slugKind })
    .from(evaluations)
    .where(eq(sql`lower(rtrim(${evaluations.linkedinUrl}, '/'))`, norm))
    .limit(1);
  if (!ev) return null;
  await db
    .insert(sponsorProfiles)
    .values({ sponsorId, evaluationId: ev.id })
    .onConflictDoNothing();
  return { evaluationId: ev.id, fullName: ev.fullName, slug: ev.slug, slugKind: ev.slugKind };
}

// Attach a profile to a sponsor by evaluation id (used by the search-based
// admin picker). Returns the attached profile, or null if the id doesn't exist.
export async function attachSponsorProfileById(
  sponsorId: string,
  evaluationId: string,
): Promise<SponsorProfile | null> {
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, slug: evaluations.slug, slugKind: evaluations.slugKind })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev) return null;
  await db
    .insert(sponsorProfiles)
    .values({ sponsorId, evaluationId: ev.id })
    .onConflictDoNothing();
  return { evaluationId: ev.id, fullName: ev.fullName, slug: ev.slug, slugKind: ev.slugKind };
}

export async function detachSponsorProfile(sponsorId: string, evaluationId: string): Promise<void> {
  await db
    .delete(sponsorProfiles)
    .where(sql`${sponsorProfiles.sponsorId} = ${sponsorId} and ${sponsorProfiles.evaluationId} = ${evaluationId}`);
}

// Profile link target: /profile/<kind>/<slug> when both are present.
export function profileHref(p: { slug: string | null; slugKind: string | null }): string | null {
  if (!p.slug || !p.slugKind) return null;
  return `/profile/${p.slugKind}/${p.slug}`;
}

// A sponsor's attached people as full leaderboard rows (name, company, scores,
// badges) — for the recap's mini leaderboard-style sponsor table. Sorted by
// combined score desc, like the attendees table. Dynamic import avoids a
// load-order cycle with leaderboard.ts (same pattern as getEventAttendeeRows).
export async function getSponsorPeopleRows(
  sponsorId: string,
): Promise<import("@/lib/leaderboard").LeaderboardRow[]> {
  const people = await getSponsorProfiles(sponsorId);
  const ids = people.map((p) => p.evaluationId);
  if (ids.length === 0) return [];
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const rows = await getLeaderboardRowsForEvalIds(ids);
  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return rows;
}
