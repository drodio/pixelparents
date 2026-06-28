import { db } from "@/db";
import { events } from "@/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { getHostsForEvent } from "@/lib/hosts";
import { getSponsorsForEvent } from "@/lib/sponsors";
import { getEventPhotos } from "@/lib/events";
import { getBadgesForEvent, getBadgesForEvents, type EventBadge } from "@/lib/event-badges-catalog";
import { sanitizeRecapHtml } from "@/lib/event-recap";

// Public event shape. Excludes everything operational/PII: host_email,
// created_by_email, approval_mode, criteria (scoring thresholds), sponsor
// (undefined shape), luma_event_id, and the internal id.
export type PublicEventBadge = { name: string; slug: string };
export type PublicEvent = {
  slug: string;
  title: string;
  host_name: string | null;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  capacity: number | null;
  status: string;
  description: string | null;
  cover_url: string | null;
  luma_url: string | null;
  source: string;
  badges: PublicEventBadge[];
};

// Public org/content sub-objects on the event detail. People rosters (attendees,
// host/sponsor team members) are attendee/member-only and NEVER exposed here.
export type PublicHost = { name: string; blurb: string | null; icon_url: string | null; url: string | null };
export type PublicSponsor = {
  name: string;
  blurb: string | null;
  logo_url: string | null;
  website_url: string | null;
};
export type PublicEventPhoto = { url: string; caption: string | null };

export type PublicEventDetail = PublicEvent & {
  hosts: PublicHost[];
  sponsors: PublicSponsor[];
  photos: PublicEventPhoto[];
  recap_html: string | null; // learnings_public (sanitized); attendee-only recap excluded
};

// The columns safe to read for a public event. Selecting an explicit set (vs
// `select()`) guarantees no PII column ever rides along into the response.
export const publicEventColumns = {
  slug: events.slug,
  title: events.title,
  hostName: events.hostName,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  venue: events.venue,
  capacity: events.capacity,
  status: events.status,
  description: events.description,
  coverUrl: events.coverUrl,
  lumaUrl: events.lumaUrl,
  source: events.source,
} as const;

type PublicEventRow = {
  slug: string;
  title: string;
  hostName: string | null;
  startsAt: Date;
  endsAt: Date | null;
  venue: string | null;
  capacity: number | null;
  status: string;
  description: string | null;
  coverUrl: string | null;
  lumaUrl: string | null;
  source: string;
};

// ---- Pure transforms (unit-testable; no DB) ----

export function toPublicBadge(b: { name: string; slug: string }): PublicEventBadge {
  return { name: b.name, slug: b.slug };
}
export function toPublicHost(h: { name: string; blurb: string | null; iconUrl: string | null; url: string | null }): PublicHost {
  return { name: h.name, blurb: h.blurb, icon_url: h.iconUrl, url: h.url };
}
export function toPublicSponsor(s: {
  name: string;
  blurb: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
}): PublicSponsor {
  return { name: s.name, blurb: s.blurb, logo_url: s.logoUrl, website_url: s.websiteUrl };
}
// Only PUBLIC-tier photos reach here (the caller filters); we expose just the
// image URL + caption (no uploader identity, source, or sort metadata).
export function toPublicPhoto(p: { blobUrl: string; caption: string | null }): PublicEventPhoto {
  return { url: p.blobUrl, caption: p.caption };
}

// Internal row → public snake_case event. `badges` is passed in (resolved via
// the join-table catalog) so this stays pure.
export function toPublicEvent(r: PublicEventRow, badges: PublicEventBadge[] = []): PublicEvent {
  return {
    slug: r.slug,
    title: r.title,
    host_name: r.hostName,
    starts_at: r.startsAt.toISOString(),
    ends_at: r.endsAt ? r.endsAt.toISOString() : null,
    venue: r.venue,
    capacity: r.capacity,
    status: r.status,
    description: r.description,
    cover_url: r.coverUrl,
    luma_url: r.lumaUrl,
    source: r.source,
    badges,
  };
}

// ---- DB-backed assembly ----

// All publicly-visible events (anything not a draft), newest first, each with its
// category badges. `badgeSlugs` (from ?badge=) filters to events carrying ANY of
// those badges (OR semantics — matches the public /events filter).
export async function listPublicEvents(badgeSlugs?: string[]): Promise<PublicEvent[]> {
  const rows = await db
    .select({ id: events.id, ...publicEventColumns })
    .from(events)
    .where(ne(events.status, "draft"))
    .orderBy(desc(events.startsAt));

  const badgeMap = await getBadgesForEvents(rows.map((r) => r.id));
  const wanted = badgeSlugs && badgeSlugs.length > 0 ? new Set(badgeSlugs) : null;

  const out: PublicEvent[] = [];
  for (const r of rows) {
    const badges = (badgeMap.get(r.id) ?? []).map(toPublicBadge);
    if (wanted && !badges.some((b) => wanted.has(b.slug))) continue;
    out.push(toPublicEvent(r, badges));
  }
  return out;
}

// One public event by slug with its hosts, sponsors, public-tier photos, badges,
// and the public recap. null when missing or a draft. Slug is unique, so this is
// a single-row lookup gated on the same published rule the listing uses.
export async function getPublicEventDetail(slug: string): Promise<PublicEventDetail | null> {
  const [row] = await db
    .select({ id: events.id, learningsPublic: events.learningsPublic, ...publicEventColumns })
    .from(events)
    .where(and(eq(events.slug, slug), ne(events.status, "draft")))
    .limit(1);
  if (!row) return null;

  const [hosts, sponsors, photos, badges] = await Promise.all([
    getHostsForEvent(row.id),
    getSponsorsForEvent(row.id),
    getEventPhotos(row.id),
    getBadgesForEvent(row.id),
  ]);

  const recapHtml = row.learningsPublic ? sanitizeRecapHtml(row.learningsPublic) : "";

  return {
    ...toPublicEvent(row, badges.map(toPublicBadge)),
    hosts: hosts.map(toPublicHost),
    sponsors: sponsors.map(toPublicSponsor),
    // PUBLIC-tier photos only — "attendees"/"claimed" tiers stay gated.
    photos: photos.filter((p) => p.visibility === "public").map(toPublicPhoto),
    recap_html: recapHtml ? recapHtml : null,
  };
}

// Re-export the badge type for route/doc consumers.
export type { EventBadge };
