// Backfill AI captions for an event's photos (the same logic as the admin
// "Caption all" route) — for events where captioning was never triggered.
// Only touches photos whose caption was NOT set manually (captionManual=false).
//   npx tsx scripts/caption-event-photos.ts --slug=id5j1bw0 --limit=2   # DRY-RUN, first 2
//   npx tsx scripts/caption-event-photos.ts --slug=id5j1bw0 --execute   # caption all + save
import { readFileSync } from "node:fs";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const SLUG = arg("slug") ?? "id5j1bw0";
const LIMIT = arg("limit") ? parseInt(arg("limit")!, 10) : Infinity;
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const env = readFileSync("/Users/drodio/Projects/founder-festival/.env.prod.local", "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; } }
}

async function main() {
  const { db } = await import("@/db");
  const { sql, and, eq, asc } = await import("drizzle-orm");
  const { events, eventPhotos } = await import("@/db/schema");
  const { generatePhotoCaption } = await import("@/lib/photo-caption");

  const [event] = await db
    .select({ id: events.id, title: events.title, description: events.description, learnings: events.learningsPublic })
    .from(events).where(eq(events.slug, SLUG)).limit(1);
  if (!event) { console.log(`event '${SLUG}' not found`); return; }

  const photos = await db
    .select({ id: eventPhotos.id, blobUrl: eventPhotos.blobUrl, captionManual: eventPhotos.captionManual, caption: eventPhotos.caption })
    .from(eventPhotos).where(eq(eventPhotos.eventId, event.id))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.createdAt));
  const targets = photos.filter((p) => !p.captionManual && !p.caption).slice(0, LIMIT);
  console.error(`event=${SLUG} (${event.title}) | ${photos.length} photos, ${targets.length} to caption | execute=${EXECUTE}\n`);

  const CONCURRENCY = 4;
  let done = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const caps = await Promise.all(batch.map((p) =>
      generatePhotoCaption({ blobUrl: p.blobUrl, eventTitle: event.title ?? "", description: event.description, learnings: event.learnings }).catch((e) => { console.log("  gen error:", (e as Error).message.slice(0, 80)); return ""; }),
    ));
    for (let j = 0; j < batch.length; j++) {
      const cap = caps[j];
      console.log(`  ${batch[j].id.slice(0, 8)}: ${cap ? `"${cap}"` : "(empty/declined)"}`);
      if (EXECUTE && cap) {
        await db.update(eventPhotos).set({ caption: cap, captionManual: false }).where(and(eq(eventPhotos.id, batch[j].id), eq(eventPhotos.eventId, event.id)));
        done++;
      }
    }
  }
  console.log(`\n${EXECUTE ? `Saved ${done} captions.` : "DRY-RUN — re-run with --execute to save."}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
