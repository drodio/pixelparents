// One-off: strip the unverified `gracechen` GitHub from the thin `grace-chen`
// profile (no company/website, score 0). The verified owner of gracechen is
// `grace-chen-3` — the LucidAct Health CEO (citations: lucidact.com/grace-chen).
// Common-name collision the matcher can't auto-split. Mirrors strip-helison-github.
//   npx tsx scripts/strip-grace-chen-github.ts            # DRY-RUN
//   npx tsx scripts/strip-grace-chen-github.ts --execute  # apply
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
  const before: any = await db.execute(sql`select id::text as id, slug, full_name, score, profile->'identity'->'github'->>'username' as gh from evaluations where slug='grace-chen'`);
  const r = (Array.isArray(before) ? before : before.rows)[0];
  if (!r) { console.log("grace-chen not found"); return; }
  console.log(`target: ${r.slug} "${r.full_name}" score=${r.score} current gh=${r.gh ?? "(none)"}`);
  if (!EXECUTE) { console.log("DRY-RUN — re-run with --execute."); return; }
  await db.execute(sql`update evaluations set profile = jsonb_set(profile, '{identity,github}', 'null'::jsonb) where id=${r.id}::uuid`);
  const after: any = await db.execute(sql`select profile->'identity'->'github'->>'username' as gh from evaluations where id=${r.id}::uuid`);
  console.log(`after gh=${(Array.isArray(after) ? after : after.rows)[0]?.gh ?? "(none)"} ✅`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
