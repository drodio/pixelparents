// One-off: dedupe the Max Stoiber pair. Keep the clean slug `max-stoiber`,
// repoint it to his canonical LinkedIn (linkedin.com/in/mxstbr — the GitHub
// username present on BOTH rows' identity, and already the URL on max-stoiber-2),
// and delete the accidental `max-stoiber-2`.
//   npx tsx scripts/dedupe-max-stoiber.ts            # DRY-RUN
//   npx tsx scripts/dedupe-max-stoiber.ts --execute  # apply
import { readFileSync } from "node:fs";
const env = readFileSync("/Users/drodio/Projects/founder-festival/.env.prod.local", "utf8");
const pick = (k: string) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
process.env.DATABASE_URL = pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL");
const EXECUTE = process.argv.includes("--execute");

(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const { deleteEvaluationsCascade } = await import("@/lib/profile-delete-cascade");

  const keep: any = await db.execute(sql`select id::text, slug, linkedin_url, full_name, score from evaluations where slug='max-stoiber'`);
  const dup: any = await db.execute(sql`select id::text, slug, linkedin_url, full_name, score, (select count(*)::int from users u where u.evaluation_id=evaluations.id) as claimed from evaluations where slug='max-stoiber-2'`);
  const k = (Array.isArray(keep) ? keep : keep.rows)[0];
  const d = (Array.isArray(dup) ? dup : dup.rows)[0];
  console.log("KEEP:", k?.slug, "|", k?.full_name, "|", k?.linkedin_url, "-> will set linkedin.com/in/mxstbr");
  console.log("DEL :", d?.slug, "|", d?.full_name, "|", d?.linkedin_url, "| claimed=", d?.claimed);
  if (d?.claimed > 0) { console.log("ABORT: dup is claimed; refusing."); return; }

  if (!EXECUTE) { console.log("\nDRY-RUN — re-run with --execute to apply."); return; }
  // Delete the dup FIRST — linkedin_url is unique, so we must free up mxstbr
  // before repointing the keeper onto it.
  if (d) { await deleteEvaluationsCascade([d.id]); console.log("deleted max-stoiber-2"); }
  if (k) { await db.execute(sql`update evaluations set linkedin_url='https://linkedin.com/in/mxstbr' where id=${k.id}::uuid`); console.log("repointed max-stoiber -> mxstbr"); }
  const after: any = await db.execute(sql`select slug, linkedin_url from evaluations where slug like 'max-stoiber%' order by slug`);
  console.log("AFTER:", JSON.stringify(Array.isArray(after) ? after : after.rows));
})().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
