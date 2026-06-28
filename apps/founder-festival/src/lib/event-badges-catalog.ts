import { db } from "@/db";
import { eventBadges, eventBadgeLinks } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

// Category badges for events (Intimate dinner, Mixer, Family friendly, …).
// Distinct from the printed name-tag "badges" in lib/event-badges.ts.

export type EventBadge = { id: string; name: string; slug: string };

// kebab-case slug used as the URL filter key + the case-insensitive de-dup key.
export function slugifyBadge(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// The whole badge vocabulary, alphabetical. Deploy-safe (returns [] if the table
// isn't present yet).
export async function listAllBadges(): Promise<EventBadge[]> {
  try {
    return await db
      .select({ id: eventBadges.id, name: eventBadges.name, slug: eventBadges.slug })
      .from(eventBadges)
      .orderBy(asc(eventBadges.name));
  } catch {
    return [];
  }
}

// Badges applied to one event, alphabetical.
export async function getBadgesForEvent(eventId: string): Promise<EventBadge[]> {
  try {
    return await db
      .select({ id: eventBadges.id, name: eventBadges.name, slug: eventBadges.slug })
      .from(eventBadgeLinks)
      .innerJoin(eventBadges, eq(eventBadges.id, eventBadgeLinks.badgeId))
      .where(eq(eventBadgeLinks.eventId, eventId))
      .orderBy(asc(eventBadges.name));
  } catch {
    return [];
  }
}

// Badges for many events at once → Map(eventId → badges). Used by the /events
// listing so the cards + filter don't fan out a query per card.
export async function getBadgesForEvents(eventIds: string[]): Promise<Map<string, EventBadge[]>> {
  const out = new Map<string, EventBadge[]>();
  if (eventIds.length === 0) return out;
  try {
    const rows = await db
      .select({
        eventId: eventBadgeLinks.eventId,
        id: eventBadges.id,
        name: eventBadges.name,
        slug: eventBadges.slug,
      })
      .from(eventBadgeLinks)
      .innerJoin(eventBadges, eq(eventBadges.id, eventBadgeLinks.badgeId))
      .where(inArray(eventBadgeLinks.eventId, eventIds))
      .orderBy(asc(eventBadges.name));
    for (const r of rows) {
      const arr = out.get(r.eventId) ?? [];
      arr.push({ id: r.id, name: r.name, slug: r.slug });
      out.set(r.eventId, arr);
    }
  } catch {
    /* table not present yet — return empty map */
  }
  return out;
}

// Replace an event's badges with the given list of names. Creates any badge that
// doesn't exist yet (deduped by slug), then resets the event's links. Returns the
// resulting badge set. Empty/blank names are ignored; deduped within the input.
export async function setBadgesForEvent(eventId: string, names: string[]): Promise<EventBadge[]> {
  const cleaned: { name: string; slug: string }[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const name = raw.trim().slice(0, 60);
    const slug = slugifyBadge(name);
    if (!name || !slug || seen.has(slug)) continue;
    seen.add(slug);
    cleaned.push({ name, slug });
  }

  // Ensure each badge exists (insert-or-ignore on slug), then read back ids.
  if (cleaned.length > 0) {
    await db
      .insert(eventBadges)
      .values(cleaned.map((c) => ({ name: c.name, slug: c.slug })))
      .onConflictDoNothing({ target: eventBadges.slug });
  }
  const slugs = cleaned.map((c) => c.slug);
  const existing = slugs.length
    ? await db
        .select({ id: eventBadges.id, name: eventBadges.name, slug: eventBadges.slug })
        .from(eventBadges)
        .where(inArray(eventBadges.slug, slugs))
    : [];

  // Reset the event's links to exactly this set.
  await db.delete(eventBadgeLinks).where(eq(eventBadgeLinks.eventId, eventId));
  if (existing.length > 0) {
    await db
      .insert(eventBadgeLinks)
      .values(existing.map((b) => ({ eventId, badgeId: b.id })))
      .onConflictDoNothing();
  }
  return existing.sort((a, b) => a.name.localeCompare(b.name));
}
