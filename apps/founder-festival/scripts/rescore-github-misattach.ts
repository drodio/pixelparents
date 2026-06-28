// Re-score the profiles caught in GitHub-username collisions, so the current
// confidence-gated github matcher (githubMatchConfidence) can strip a wrongly
// attached GitHub. Non-destructive: reEvaluate updates each row in place
// (preserves id + claims). Skips CLAIMED profiles (don't disturb a real user's
// profile / the owner). Re-scoring the legit github owner is harmless (keeps it);
// re-scoring a mis-attach victim drops the bad github.
//   npx tsx scripts/rescore-github-misattach.ts --target=prod            # DRY-RUN (list targets)
//   npx tsx scripts/rescore-github-misattach.ts --target=prod --execute  # re-score
import { readFileSync } from "node:fs";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const file = target === "prod" ? "/Users/drodio/Projects/founder-festival/.env.prod.local" : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; } }
}

type Row = { id: string; slug: string; full_name: string | null; gh: string; score: number | null; claimed: number };

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { reEvaluate } = await import("@/lib/eval-pipeline");

  console.error(`target=${target} host=${new URL(process.env.DATABASE_URL!).host.split(".")[0]} execute=${EXECUTE}\n`);

  const res: any = await db.execute(sql`
    select e.id::text as id, e.slug, e.full_name, e.score,
      lower(e.profile->'identity'->'github'->>'username') as gh,
      (select count(*)::int from users u where u.evaluation_id=e.id) as claimed
    from evaluations e
    where e.profile->'identity'->'github'->>'username' is not null
      and lower(e.profile->'identity'->'github'->>'username') in (
        select lower(profile->'identity'->'github'->>'username')
        from evaluations where profile->'identity'->'github'->>'username' is not null
        group by 1 having count(*)>1)
    order by gh, e.score desc`);
  const rows = (Array.isArray(res) ? res : res.rows) as Row[];
  const targets = rows.filter((r) => r.claimed === 0);
  const skipped = rows.filter((r) => r.claimed > 0);

  console.log(`${rows.length} profiles in github-collision groups; ${targets.length} to re-score, ${skipped.length} skipped (claimed).`);
  for (const r of skipped) console.log(`  · SKIP (claimed) ${r.slug} [gh=${r.gh}]`);
  console.log("");
  if (!EXECUTE) {
    for (const r of targets) console.log(`  · would re-score ${r.slug}  "${r.full_name}"  gh=${r.gh} score=${r.score}`);
    console.log(`\nDRY-RUN — re-run with --execute.`);
    return;
  }

  let stripped = 0, kept = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    try {
      await reEvaluate(r.id);
      const after: any = await db.execute(sql`select lower(profile->'identity'->'github'->>'username') as gh, score from evaluations where id=${r.id}::uuid`);
      const a = (Array.isArray(after) ? after : after.rows)[0];
      const changed = (a?.gh ?? null) !== r.gh;
      if (changed) stripped++; else kept++;
      console.log(`[${i + 1}/${targets.length}] ${r.slug}: gh ${r.gh} -> ${a?.gh ?? "(none)"}  score ${r.score} -> ${a?.score}  ${changed ? "✂️ changed" : "kept"}`);
    } catch (e) {
      failed++;
      console.log(`[${i + 1}/${targets.length}] ${r.slug}: FAILED — ${(e as Error).message.split("\n")[0]}`);
    }
  }
  console.log(`\nDone. ${stripped} github changed/stripped, ${kept} kept, ${failed} failed.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
