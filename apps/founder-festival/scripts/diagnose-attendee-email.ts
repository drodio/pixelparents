// Read-only: for a given event, show each matched attendee's stored email and
// whether a profile-email fallback (Clerk claimer / profile_emails) exists.
// Usage: npx tsx scripts/diagnose-attendee-email.ts --target=prod --event=<id> [--name=odio]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const target = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev";
const eventId = process.argv.find((a) => a.startsWith("--event="))?.split("=")[1] ?? "";
const nameFilter = (process.argv.find((a) => a.startsWith("--name="))?.split("=")[1] ?? "").toLowerCase();
const file = target === "prod"
  ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
  : "/Users/drodio/Projects/founder-festival/.env.local";
const env = readFileSync(file, "utf8");
const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
const url = pick("DATABASE_URL_UNPOOLED") || pick("POSTGRES_URL_NON_POOLING") || pick("DATABASE_URL") || pick("POSTGRES_URL");

if (!url) throw new Error("DATABASE_URL missing");
if (!eventId) throw new Error("--event=<id> required");
const sql = neon(url);

async function main() {
const rows = await sql`
  SELECT ea.name, ea.email AS stored_email, ea.source, ea.removed_by_admin,
    ea.evaluation_id IS NOT NULL AS matched,
    (SELECT u.clerk_user_id FROM users u WHERE u.evaluation_id = ea.evaluation_id
      AND u.clerk_user_id IS NOT NULL
      ORDER BY (u.match_confidence = 'high') DESC, u.verified_at DESC NULLS LAST LIMIT 1) AS clerk_user_id,
    (SELECT email FROM profile_emails pe WHERE pe.evaluation_id = ea.evaluation_id
      ORDER BY (status = 'verified') DESC, added_at ASC LIMIT 1) AS profile_email
  FROM event_attendees ea
  WHERE ea.event_id = ${eventId} AND ea.removed_by_admin = false
  ORDER BY ea.name`;

const shown = nameFilter ? rows.filter((r) => String(r.name ?? "").toLowerCase().includes(nameFilter)) : rows;
console.log(`[${target}] event ${eventId} — ${rows.length} attendees (${shown.length} shown)`);
for (const r of shown) {
  console.log(
    `  ${String(r.name ?? "?").padEnd(28)} stored=${r.stored_email ?? "—"}  matched=${r.matched}  ` +
      `clerk=${r.clerk_user_id ? "yes" : "no"}  profile_email=${r.profile_email ?? "—"}`,
  );
}
}

main();
