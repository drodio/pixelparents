// Apply the improved githubMatchConfidence (username-encodes-name) to the
// specific profiles the earlier conservative pass mis-handled: restore the
// GitHub on distinctive legit owners that were wrongly stripped, and strip the
// `helsont` residual from Helison Tavares. Non-destructive (reEvaluate in place).
// Deliberately EXCLUDES the common-name pairs (two Laura Lins, the other Grace
// Chen) so we don't re-introduce an ambiguous same-name collision.
//   npx tsx scripts/rescore-github-fix-apply.ts            # DRY-RUN
//   npx tsx scripts/rescore-github-fix-apply.ts --execute  # apply
import { readFileSync } from "node:fs";
const target = "prod";
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const env = readFileSync("/Users/drodio/Projects/founder-festival/.env.prod.local", "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; } }
}

const SLUGS = [
  "zane-salim",
  "alejandro-al-guerrero",
  "gowtham-sundaresan",
  "victor-piskunov",
  "samit-khalsa",
  "grace-chen-3",
  "helison-tavares",
];

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { reEvaluate } = await import("@/lib/eval-pipeline");
  console.error(`target=${target} host=${new URL(process.env.DATABASE_URL!).host.split(".")[0]} execute=${EXECUTE}\n`);

  for (let i = 0; i < SLUGS.length; i++) {
    const slug = SLUGS[i];
    const before: any = await db.execute(sql`
      select id::text as id, full_name, score,
        lower(profile->'identity'->'github'->>'username') as gh,
        (select count(*)::int from users u where u.evaluation_id=evaluations.id) as claimed
      from evaluations where slug=${slug}`);
    const r = (Array.isArray(before) ? before : before.rows)[0];
    if (!r) { console.log(`· SKIP ${slug} — not found`); continue; }
    if (!EXECUTE) {
      console.log(`· would re-score ${slug}  "${r.full_name}"  gh=${r.gh ?? "(none)"} score=${r.score} claimed=${r.claimed}`);
      continue;
    }
    try {
      await reEvaluate(r.id);
      const after: any = await db.execute(sql`select lower(profile->'identity'->'github'->>'username') as gh, score from evaluations where id=${r.id}::uuid`);
      const a = (Array.isArray(after) ? after : after.rows)[0];
      console.log(`[${i + 1}/${SLUGS.length}] ${slug}: gh ${r.gh ?? "(none)"} -> ${a?.gh ?? "(none)"}  score ${r.score} -> ${a?.score}`);
    } catch (e) {
      console.log(`[${i + 1}/${SLUGS.length}] ${slug}: FAILED — ${(e as Error).message.split("\n")[0]}`);
    }
  }
  if (!EXECUTE) console.log("\nDRY-RUN — re-run with --execute.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
