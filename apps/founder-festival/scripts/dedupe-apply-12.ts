// Apply the 12 hand-vetted duplicate deletions (batch-2). These are NOT re-judged
// by the LLM — they're an explicit, reviewed list of [deleteSlug, keepSlug] pairs
// where the deleted twin is provably a different/thin LinkedIn and the keeper is
// email/handle-anchored. Deletes via the same cascade the app uses.
//
//   npx tsx scripts/dedupe-apply-12.ts --target=prod            # DRY-RUN (plan only)
//   npx tsx scripts/dedupe-apply-12.ts --target=prod --execute  # delete
import { readFileSync } from "node:fs";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const EXECUTE = process.argv.includes("--execute");
if (!process.env.DATABASE_URL) {
  const file = target === "prod"
    ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
    : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
  process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { const v = m[2].trim().replace(/^["']|["']$/g, ""); if (v && !process.env[m[1]]) process.env[m[1]] = v; } }
}

// [deleteSlug, keepSlug]
const PAIRS: [string, string][] = [
  ["christine-zhang-2", "christine-zhang"],
  ["christina-c-2", "christina-c"],
  ["jaskaran-singh", "jaskar-singh"],
  ["aishwarya-kamat", "aishwarya-prashant-kamat"],
  ["dian-lin", "dian-hua-lin"],
  ["nel-jacques", "nelly-jacques"],
  ["l-venkatraman", "venkatraman-l"],
  ["d-ramkumar", "ramkumar-d"],
  ["chris-s-2", "chris-s"],
  ["scott-t-2", "scott-t"],
  ["ganesh-morye-2", "ganesh-morye"],
  ["maria-jose-nunez", "maria-jose-nunez-2"],
];

type R = { slug: string; id: string; full_name: string | null; linkedin_url: string | null; score: number | null; claimed: number };

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { deleteEvaluationsCascade } = await import("@/lib/profile-delete-cascade");

  console.error(`target=${target} host=${new URL(process.env.DATABASE_URL!).host.split(".")[0]} execute=${EXECUTE}\n`);

  const idsToDelete: string[] = [];
  let skipped = 0;
  for (const [delSlug, keepSlug] of PAIRS) {
    const res = await db.execute(sql`
      select e.slug, e.id::text as id, e.full_name, e.linkedin_url, e.score,
        (select count(*)::int from users u where u.evaluation_id = e.id) as claimed
      from evaluations e where e.slug in (${delSlug}, ${keepSlug})`);
    const rows = (Array.isArray(res) ? res : (res as unknown as { rows: R[] }).rows) as R[];
    const del = rows.find((x) => x.slug === delSlug);
    const keep = rows.find((x) => x.slug === keepSlug);

    if (!del) { console.log(`· SKIP  ${delSlug} — not found (already deleted)`); skipped++; continue; }
    if (!keep) { console.log(`· SKIP  ${delSlug} — keeper "${keepSlug}" NOT found; refusing to delete`); skipped++; continue; }
    if (del.claimed > 0) { console.log(`· SKIP  ${delSlug} — it is CLAIMED (${del.claimed} user); refusing to delete`); skipped++; continue; }

    console.log(
      `· DELETE ${del.slug}  [${del.full_name ?? "?"} | ${del.linkedin_url ?? "?"} | score ${del.score ?? "-"}]\n` +
      `    KEEP   ${keep.slug}  [${keep.full_name ?? "?"} | ${keep.linkedin_url ?? "?"} | score ${keep.score ?? "-"}${keep.claimed > 0 ? " | CLAIMED" : ""}]`,
    );
    idsToDelete.push(del.id);
  }

  console.log(`\n${idsToDelete.length} to delete, ${skipped} skipped.`);
  if (!EXECUTE) { console.log("DRY-RUN — re-run with --execute to apply."); return; }
  if (idsToDelete.length === 0) { console.log("Nothing to delete."); return; }
  await deleteEvaluationsCascade(idsToDelete);
  console.log(`✅ Deleted ${idsToDelete.length} duplicate profiles.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
