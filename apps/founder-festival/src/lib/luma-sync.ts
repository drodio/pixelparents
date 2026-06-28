import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { listLumaEvents, lumaSlugFromUrl, type LumaEvent } from "./luma";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Base slug for a NEW Luma event: prefer the event TITLE so URLs read like the
// event ("summer-founder-dinner") rather than Luma's opaque URL code. Falls back
// to the lu.ma URL slug, then a luma-<id> last resort when the title slugifies to
// nothing (e.g. an emoji-only name). Made unique by uniqueEventSlug before insert.
export function eventSlugBase(ev: { name: string; url?: string | null; api_id: string }): string {
  return (
    slugify(ev.name) ||
    lumaSlugFromUrl(ev.url) ||
    `luma-${ev.api_id.replace(/^evt-/, "").toLowerCase()}`
  );
}

// Resolve a base slug to one not already taken by another event, appending
// -2, -3, … on collision (the events.slug unique index would otherwise throw on
// insert since the upsert keys on lumaEventId, not slug).
export async function uniqueEventSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  // Bounded: each miss increments n, and only finitely many events share a base.
  while (true) {
    const [clash] = await db.select({ id: events.id }).from(events).where(eq(events.slug, candidate)).limit(1);
    if (!clash) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

// Short "City, ST" from Luma's geo block when it's there (null otherwise — an
// admin can fill it in). The public API only reliably returns city/region for
// Luma-hosted in-person events.
function locationOf(ev: LumaEvent): string | null {
  const g = ev.geo_address_json;
  const city = g?.city?.trim();
  const region = g?.region?.trim();
  if (city && region) return `${city}, ${region}`;
  return city || region || null;
}

function venueOf(ev: LumaEvent): string | null {
  if (ev.geo_address_json?.full_address) return ev.geo_address_json.full_address;
  if (ev.geo_address_json?.address) return ev.geo_address_json.address;
  if (ev.meeting_url) return "Virtual";
  return null;
}

// Re-import ONE event's details from Luma (title, description, cover, date,
// venue, lu.ma URL), keyed by its stored lumaEventId. Overwrites those fields
// with the current Luma values; leaves slug + admin-entered content (learnings,
// photos, hosts) untouched. Throws if the event isn't a Luma row or is no longer
// on the calendar.
export async function reimportLumaEvent(eventId: string): Promise<{ ok: true; title: string }> {
  const [ev] = await db
    .select({ lumaEventId: events.lumaEventId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!ev) throw new Error("event not found");
  if (!ev.lumaEventId) throw new Error("not a Luma-sourced event");

  const match = (await listLumaEvents()).find((e) => e.api_id === ev.lumaEventId);
  if (!match) throw new Error("event is no longer on the Luma calendar");

  await db
    .update(events)
    .set({
      title: match.name,
      startsAt: new Date(match.start_at),
      endsAt: match.end_at ? new Date(match.end_at) : null,
      venue: venueOf(match),
      // Only overwrite location when Luma has one — never wipe an admin-set value.
      ...(locationOf(match) ? { location: locationOf(match) } : {}),
      description: match.description ?? null,
      lumaUrl: match.url ?? null,
      coverUrl: match.cover_url ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(events.id, eventId));
  return { ok: true, title: match.name };
}

// Pull every event off the Luma calendar and upsert it into our events table,
// keyed by luma_event_id (re-runs update in place — no duplicates). Returns
// how many rows were written. Imported rows are marked source="luma" and
// carry the lu.ma URL + cover so the admin list can link straight to Luma.
export async function syncLumaEvents(): Promise<{ synced: number }> {
  const lumaEvents = await listLumaEvents();
  let synced = 0;
  for (const ev of lumaEvents) {
    // Title-first slug for new events; uniqueness-resolved. Only used on INSERT —
    // existing events keep their original slug (onConflictDoUpdate omits slug),
    // so this is future-facing and never breaks an already-shared link.
    const slug = await uniqueEventSlug(eventSlugBase(ev));
    await db
      .insert(events)
      .values({
        slug,
        title: ev.name,
        startsAt: new Date(ev.start_at),
        endsAt: ev.end_at ? new Date(ev.end_at) : null,
        venue: venueOf(ev),
        location: locationOf(ev),
        description: ev.description ?? null,
        status: "open",
        source: "luma",
        lumaEventId: ev.api_id,
        lumaUrl: ev.url ?? null,
        coverUrl: ev.cover_url ?? null,
      })
      .onConflictDoUpdate({
        target: events.lumaEventId,
        set: {
          // Refresh the mutable fields from Luma on every sync. slug is left
          // alone after first import so existing links don't break.
          title: ev.name,
          startsAt: new Date(ev.start_at),
          endsAt: ev.end_at ? new Date(ev.end_at) : null,
          venue: venueOf(ev),
          // Only overwrite location when Luma has one — never wipe an admin-set value.
          ...(locationOf(ev) ? { location: locationOf(ev) } : {}),
          description: ev.description ?? null,
          lumaUrl: ev.url ?? null,
          coverUrl: ev.cover_url ?? null,
          updatedAt: sql`now()`,
        },
      });
    synced++;
  }
  return { synced };
}
