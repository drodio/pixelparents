// PREVIEW (read-only): what the founder leaderboard becomes if the dollar-magnitude
// rows (founder_valuation / founder_exit / venture_raised) are log-compressed via
// curvedDollarPoints. No writes — computes the new founder_score in memory from the
// stored breakdown and prints old-vs-new. Run: npx tsx scripts/preview-dollar-curve.ts prod
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const target = process.argv[2] ?? "prod";

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const { curvedDollarPoints } = await import("../src/lib/scoring");
  const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
  if (!conn) throw new Error(`no conn for ${target}`);
  if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error("prod host guard");
  const sql = neon(conn);

  const rows = (await sql`
    SELECT slug, full_name, founder_score, breakdown FROM evaluations
    WHERE signal_quality <> 'low' AND source <> 'code'`) as any[];

  type Calc = { slug: string; old: number; neu: number; delta: number; topRow: string };
  const calc: Calc[] = [];
  let touched = 0;
  for (const r of rows) {
    const f = (r.breakdown?.founder ?? []) as Array<{ points: number; rule?: string; reason?: string }>;
    let delta = 0;
    let curvedTop = "";
    for (const row of f) {
      const curved = curvedDollarPoints(row.rule, row.points || 0);
      if (curved === null) continue;
      delta += curved - (row.points || 0);
      if (!curvedTop) curvedTop = `${row.rule}: ${row.points}→${curved}`;
    }
    if (delta !== 0) touched++;
    const neu = (r.founder_score || 0) + delta;
    calc.push({ slug: r.slug ?? r.full_name ?? "?", old: r.founder_score || 0, neu, delta, topRow: curvedTop });
  }

  console.log(`# Dollar log-curve preview — ${target}\n`);
  console.log(`Profiles: ${rows.length}; with a dollar row recompacted: ${touched}\n`);

  const oldRank = calc.slice().sort((a, b) => b.old - a.old);
  const newRank = calc.slice().sort((a, b) => b.neu - a.neu);
  const newPos = new Map(newRank.map((c, i) => [c.slug, i + 1]));

  console.log("## OLD top-20 (by current founder_score) → new score + new rank");
  console.log("  oldRank  oldScore → newScore  newRank  slug  (curve)");
  oldRank.slice(0, 20).forEach((c, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)}.  ${String(c.old).padStart(9)} → ${String(c.neu).padStart(4)}   #${String(newPos.get(c.slug)).padStart(3)}  ${c.slug.padEnd(20)} ${c.topRow}`,
    );
  });

  console.log("\n## NEW top-25 (by recalibrated score) — what the leaderboard becomes");
  newRank.slice(0, 25).forEach((c, i) => {
    const oldPos = oldRank.findIndex((x) => x.slug === c.slug) + 1;
    const arrow = oldPos > i + 1 ? `▲${oldPos - (i + 1)}` : oldPos < i + 1 ? `▼${i + 1 - oldPos}` : "=";
    console.log(`  ${String(i + 1).padStart(3)}.  ${String(c.neu).padStart(4)}  (was ${String(c.old).padStart(8)}, #${oldPos} ${arrow})  ${c.slug}`);
  });

  // Biggest climbers: skill-heavy founders who were buried under valuation-dominated peers
  console.log("\n## Biggest RANK CLIMBERS (skill rising as $ compresses)");
  const climbers = calc
    .map((c) => ({ ...c, oldP: oldRank.findIndex((x) => x.slug === c.slug) + 1, newP: newPos.get(c.slug)! }))
    .filter((c) => c.oldP <= 200)
    .sort((a, b) => b.oldP - b.newP - (a.oldP - a.newP))
    .slice(0, 12);
  for (const c of climbers) console.log(`  ${c.slug.padEnd(24)} #${c.oldP} → #${c.newP}  (score ${c.old}→${c.neu})`);
}
main().then(() => process.exit(0));
