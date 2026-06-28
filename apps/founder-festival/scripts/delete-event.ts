// Delete a single event by slug (or Luma event id), cascading to its child
// rows (applicants/invites/attendees/photos/host-links) and nulling the one
// non-cascading FK (bypass_codes.event_id).
//
//   # Preview:
//   npx tsx scripts/delete-event.ts --target=prod --slug=founder-qoeu --dry
//   # Delete (requires --confirm):
//   npx tsx scripts/delete-event.ts --target=prod --slug=founder-qoeu --confirm
//
// NOTE: for a source="luma" event, also remove it from the Luma calendar —
// otherwise the next "Sync from Luma" re-inserts it.
//
// Flags: --target=dev|prod · --slug=<slug> | --luma=<evt-id> · --dry · --confirm
import { readFileSync } from "node:fs";

const arg = (n: string, d = "") => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
const has = (n: string) => process.argv.includes(`--${n}`);
const target = (arg("target", "dev") as "dev" | "prod");
const slug = arg("slug");
const luma = arg("luma");
const dry = has("dry") || !has("confirm");

if (!slug && !luma) {
  console.error("Provide --slug=<slug> or --luma=<evt-id>.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  const file =
    target === "prod"
      ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
      : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => {
    const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  process.env.DATABASE_URL =
    pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL") || pick("DATABASE_URL_UNPOOLED");
}

async function main() {
  const { db } = await import("@/db");
  const { events, bypassCodes } = await import("@/db/schema");
  const { eq, inArray } = await import("drizzle-orm");

  const matches = await db
    .select({ id: events.id, title: events.title, slug: events.slug, source: events.source, lumaEventId: events.lumaEventId })
    .from(events)
    .where(slug ? eq(events.slug, slug) : eq(events.lumaEventId, luma));

  console.log(`[delete-event] target=${target} dry=${dry} match=${matches.length}`);
  matches.forEach((m) => console.log(`   • ${m.title}  [${m.slug}]  source=${m.source}  luma=${m.lumaEventId ?? "-"}`));

  if (matches.length === 0) { console.log("[delete-event] no match."); return; }
  if (dry) { console.log("[delete-event] DRY RUN — re-run with --confirm to delete."); return; }

  const ids = matches.map((m) => m.id);
  await db.update(bypassCodes).set({ eventId: null }).where(inArray(bypassCodes.eventId, ids));
  await db.delete(events).where(inArray(events.id, ids));
  console.log(`[delete-event] deleted ${ids.length} event(s) (children cascaded).`);
  if (matches.some((m) => m.source === "luma")) {
    console.log("[delete-event] ⚠️  This was a Luma event — remove it from the Luma calendar too, or the next sync will re-add it.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
