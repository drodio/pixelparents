// One-off: strip the wrongly-attached `helsont` GitHub from the Helison Tavares
// (Granorte, Brazil) profile. Evidence that helsont belongs to HELSON Taveras,
// not Helison: his LinkedIn handle is literally `helsontaveras`, company Keep
// Technologies / trykeep.com, and the handle `helsont` = helson+t. The github
// account's own data conflates the two names, so the matcher can't auto-split it.
//   npx tsx scripts/strip-helison-github.ts            # DRY-RUN
//   npx tsx scripts/strip-helison-github.ts --execute  # apply
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
  const before: any = await db.execute(sql`select id::text as id, slug, full_name, profile->'identity'->'github'->>'username' as gh from evaluations where slug='helison-tavares'`);
  const r = (Array.isArray(before) ? before : before.rows)[0];
  if (!r) { console.log("helison-tavares not found"); return; }
  console.log(`target: ${r.slug} "${r.full_name}" current gh=${r.gh ?? "(none)"}`);
  if (!EXECUTE) { console.log("DRY-RUN — re-run with --execute."); return; }
  // Set identity.github to null (clears the collision + any github display).
  await db.execute(sql`update evaluations set profile = jsonb_set(profile, '{identity,github}', 'null'::jsonb) where id=${r.id}::uuid`);
  const after: any = await db.execute(sql`select profile->'identity'->'github'->>'username' as gh from evaluations where id=${r.id}::uuid`);
  console.log(`after gh=${(Array.isArray(after) ? after : after.rows)[0]?.gh ?? "(none)"} ✅`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
