// Recompute existing founder scores onto the CURRENT enterprise-value curve
// (curvedDollarPoints in scoring.ts) WITHOUT re-research or LLM. Reads the ORIGINAL
// linear breakdowns from the backup file (so it's idempotent and curve-agnostic —
// re-run it any time the curve changes) and rewrites prod.
//
//   DRY RUN (default):  npx tsx scripts/recompute-dollar-curve.ts prod
//   APPLY (writes!):    npx tsx scripts/recompute-dollar-curve.ts prod --apply
//
// Correctness: the dollar rules are clamp-EXEMPT and pinned verification=
// authoritative (weighting ×1), so each contributes its raw points to founder_score.
// new_founder_score = original_linear_founder_score − Σ(orig dollar pts) + Σ(curved).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as fs from "node:fs";

const target = process.argv[2] ?? "prod";
const APPLY = process.argv.includes("--apply");
const BACKUP = `/tmp/dollar-curve-backup-${target}-359.json`;

type Row = { points: number; rule?: string | null };
type Backup = { id: string; slug: string; breakdown: { founder?: Row[]; investor?: Row[] }; founder_score: number; score: number };

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const { curvedDollarPoints } = await import("../src/lib/scoring");
  const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
  if (!conn) throw new Error(`no conn for ${target}`);
  if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error("prod host guard");
  if (!fs.existsSync(BACKUP)) throw new Error(`backup not found: ${BACKUP} (it holds the ORIGINAL linear values)`);
  const sql = neon(conn);
  const backup = JSON.parse(fs.readFileSync(BACKUP, "utf8")) as Backup[];

  const updates: Array<{ id: string; slug: string; oldF: number; newF: number; newScore: number; breakdown: unknown }> = [];
  for (const b of backup) {
    const bd = b.breakdown ?? {};
    const f = (bd.founder ?? []) as Row[];
    let origDollar = 0;
    let newDollar = 0;
    const newFounder = f.map((row) => {
      const curved = curvedDollarPoints(row.rule, row.points || 0);
      if (curved === null) return row;
      origDollar += row.points || 0;
      newDollar += curved;
      return { ...row, points: curved };
    });
    if (origDollar === 0) continue;
    const newF = b.founder_score - origDollar + newDollar;
    const investor = b.score - b.founder_score; // backup score = founder + investor (original)
    updates.push({ id: b.id, slug: b.slug, oldF: b.founder_score, newF, newScore: newF + investor, breakdown: { ...bd, founder: newFounder } });
  }

  console.log(`# recompute (enterprise-value curve) — ${target} — ${APPLY ? "APPLY (writing)" : "DRY RUN"}`);
  console.log(`Source: ${BACKUP} (${backup.length} original rows). Changing: ${updates.length}\n`);
  console.log("Top 12 by NEW founder score:");
  for (const u of updates.slice().sort((a, b) => b.newF - a.newF).slice(0, 12)) {
    console.log(`  ${String(u.newF).padStart(5)}  (orig-linear ${String(u.oldF).padStart(9)})  ${u.slug}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — no writes. Re-run with --apply to persist.");
    return;
  }
  console.log("\nApplying…");
  let done = 0;
  for (const u of updates) {
    await sql`UPDATE evaluations SET breakdown = ${u.breakdown}::jsonb, founder_score = ${u.newF}, score = ${u.newScore} WHERE id = ${u.id}`;
    if (++done % 50 === 0) console.log(`  …${done}/${updates.length}`);
  }
  console.log(`Done. Updated ${done} rows from the original-linear backup.`);
}
main().then(() => process.exit(0));
