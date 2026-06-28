// One-off: upgrade DROdio's OWN claim on his own profile from "medium" to "high"
// so /profile/drodio reads as publicly claimed (avatar/nickname show; no "Claim").
// His profile was scored from a LinkedIn URL (no stored email) and Clerk's
// LinkedIn OIDC doesn't expose his vanity handle, so the matcher could only
// name-match -> "medium"; "high" is unreachable automatically. This is HIS
// account (clerk_username='drodio') on HIS profile, so the verification is
// legitimate — we just can't auto-derive it.
//   npx tsx scripts/upgrade-drodio-claim.ts            # DRY-RUN
//   npx tsx scripts/upgrade-drodio-claim.ts --execute  # apply
import { readFileSync } from "node:fs";
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const env = readFileSync("/Users/drodio/Projects/founder-festival/.env.prod.local", "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
}
async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  // The claim row that is unambiguously DROdio's: clerk_username='drodio' on the
  // 'drodio' eval.
  const before: any = await db.execute(sql`
    select u.id::text as id, u.clerk_user_id, u.clerk_username, u.match_confidence, e.slug
    from users u join evaluations e on e.id = u.evaluation_id
    where e.slug = 'drodio' and lower(u.clerk_username) = 'drodio'`);
  const rows = (Array.isArray(before) ? before : before.rows);
  if (rows.length === 0) { console.log("No clerk_username='drodio' claim on the drodio eval — aborting."); return; }
  if (rows.length > 1) { console.log(`WARN: ${rows.length} matching rows; will upgrade all of them.`); }
  for (const r of rows) console.log(`target: users.id=${r.id.slice(0, 8)} clerk_username=${r.clerk_username} match_confidence=${r.match_confidence} -> high`);
  if (!EXECUTE) { console.log("DRY-RUN — re-run with --execute."); return; }
  await db.execute(sql`
    update users set match_confidence = 'high'
    where evaluation_id = (select id from evaluations where slug = 'drodio')
      and lower(clerk_username) = 'drodio'`);
  const after: any = await db.execute(sql`
    select u.match_confidence from users u join evaluations e on e.id=u.evaluation_id
    where e.slug='drodio' and lower(u.clerk_username)='drodio'`);
  console.log(`after: ${(Array.isArray(after) ? after : after.rows).map((x: any) => x.match_confidence).join(", ")} ✅`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
