// Read-only model of a SQUARE-ROOT enterprise-value curve (no cap, no best-company
// weighting — every company summed). points(usd) = round(C * sqrt(usd)); the scale C
// is expressed via "a $100B company ≈ N points" so it's intuitive. Uses the pre-curve
// BACKUP (original linear dollar points → recover USD). NO writes.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import * as fs from "node:fs";

type Row = { points: number; rule?: string; reason?: string };
type Backup = { id: string; slug: string; breakdown: { founder?: Row[] }; founder_score: number };
const OUTCOME_RULES = new Set(["founder_exit", "founder_valuation"]);

// Variant: scale anchored on "a $100B company is worth `per100B` points".
type Variant = { name: string; per100B: number; raiseFactor: number };
function scaleFor(per100B: number): number {
  return per100B / Math.sqrt(100e9); // C such that C*sqrt(100e9) = per100B
}
function sqrtPoints(usd: number, C: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(C * Math.sqrt(usd));
}

function dollarContribution(founder: Row[], v: Variant): number {
  const C = scaleFor(v.per100B);
  let total = 0;
  for (const r of founder) {
    const usd = (r.points || 0) * 1_000_000; // backup points are linear floor(usd/$1M)
    if (r.rule && OUTCOME_RULES.has(r.rule)) total += sqrtPoints(usd, C);
    else if (r.rule === "venture_raised") total += Math.round(sqrtPoints(usd, C) * v.raiseFactor);
  }
  return total;
}

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.POSTGRES_URL_NON_POOLING!);
  const backup = JSON.parse(fs.readFileSync("/tmp/dollar-curve-backup-prod-359.json", "utf8")) as Backup[];
  const byId = new Map(backup.map((b) => [b.id, b]));
  const all = (await sql`SELECT id, slug, founder_score FROM evaluations WHERE signal_quality<>'low' AND source<>'code'`) as any[];

  const variants: Variant[] = [
    { name: "$100B≈150 pts (company value ~ on par with skill)", per100B: 150, raiseFactor: 0.5 },
    { name: "$100B≈300 pts (generational clearly outscore)", per100B: 300, raiseFactor: 0.5 },
    { name: "$100B≈500 pts (company value dominates)", per100B: 500, raiseFactor: 0.5 },
  ];

  // reference points for a few company sizes
  for (const v of variants) {
    const C = scaleFor(v.per100B);
    console.log(`\n========== SQRT — ${v.name} ==========`);
    console.log(`  reference: $200M→${sqrtPoints(2e8,C)} | $1B→${sqrtPoints(1e9,C)} | $12.7B(Groupon)→${sqrtPoints(1.27e10,C)} | $91.5B(Stripe)→${sqrtPoints(9.15e10,C)} | $1.74T(MSFT)→${sqrtPoints(1.74e12,C)}`);
    const scored = all.map((r) => {
      const b = byId.get(r.id);
      let f = r.founder_score || 0;
      if (b) {
        const orig = b.breakdown.founder ?? [];
        const dollarPts = orig.filter((x) => x.rule && (OUTCOME_RULES.has(x.rule) || x.rule === "venture_raised")).reduce((s, x) => s + (x.points || 0), 0);
        f = (b.founder_score - dollarPts) + dollarContribution(orig, v);
      }
      return { slug: r.slug ?? "?", f };
    });
    scored.sort((a, b) => b.f - a.f);
    const pos = (s: string) => scored.findIndex((x) => x.slug === s) + 1;
    console.log("  Top 12:");
    scored.slice(0, 12).forEach((s, i) => console.log(`    ${String(i + 1).padStart(2)}. ${String(s.f).padStart(5)}  ${s.slug}`));
    console.log(`    → jordan-lee #${pos("jordan-lee")} | alex-kim #${pos("alex-kim")} | jamie-park #${pos("jamie-park")} | casey-morgan #${pos("casey-morgan")} | taylor-rivera #${pos("taylor-rivera")}`);
  }
}
main().then(() => process.exit(0));
