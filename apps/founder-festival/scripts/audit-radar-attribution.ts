// Read-only scoring-quality audit over the PROD population. Finds the NEXT class
// of radar issues after the percentile artifact:
//   (1) LOST SIGNAL  — breakdown rows that score points but attribute to NO
//       vector (attributeRow/attributeInvestorRow → null). Those points count in
//       the founder/investor TOTAL but never appear on the radar, so the radar
//       under-represents the score. We aggregate the most common null-reason
//       shapes → these are attribution-RULE GAPS worth closing.
//   (2) SINGLE-ROW DOMINATION — a vector whose points come almost entirely from
//       ONE row. Fragile + often a sign of company-credit-as-individual.
//   (3) INVESTOR-SIDE coverage — how much investor signal is lost vs founder.
// Pure read. Run: npx tsx scripts/audit-radar-attribution.ts prod
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import {
  founderRows,
  investorRows,
  attributeRow,
  attributeInvestorRow,
  bucketByVector,
  bucketInvestorByVector,
  type BreakdownRow,
} from "../src/lib/credibility-vectors";

const target = process.argv[2] ?? "prod";
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
const host = conn.match(/ep-[a-z-]+/)?.[0] ?? "?";
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod target but host is ${host}`);
const sql = neon(conn);

type Row = {
  slug: string | null;
  full_name: string | null;
  founder_score: number;
  investor_score: number;
  breakdown: unknown;
};

// Collapse a reason sentence to a coarse signature so we can count GAP shapes.
// Keep the first ~6 lowercased alpha tokens, strip numbers/punct.
function sig(reason: string): string {
  return (reason || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

async function main() {
  console.log(`# Radar attribution audit — target=${target} host=${host}\n`);
  const rows = (await sql`
    SELECT slug, full_name, founder_score, investor_score, breakdown
    FROM evaluations
    WHERE signal_quality <> 'low' AND source <> 'code'
  `) as Row[];
  console.log(`Scored profiles analyzed: ${rows.length}\n`);

  // ---- (1) LOST SIGNAL -----------------------------------------------------
  const nullFounderSig = new Map<string, { count: number; points: number; ex: string }>();
  const nullInvestorSig = new Map<string, { count: number; points: number; ex: string }>();
  let fLostTot = 0,
    fScoredTot = 0,
    iLostTot = 0,
    iScoredTot = 0;
  const bigFounderLosers: Array<{ who: string; lost: number; of: number; rows: string[] }> = [];
  const bigInvestorLosers: Array<{ who: string; lost: number; of: number; rows: string[] }> = [];

  // ---- (2) DOMINATION ------------------------------------------------------
  const dominated: Array<{ who: string; vec: string; row: string; pts: number; share: number }> = [];

  for (const r of rows) {
    const who = r.slug ?? r.full_name ?? "?";
    const fr = founderRows(r.breakdown);
    const ir = investorRows(r.breakdown);

    // lost founder signal
    let fLost = 0,
      fScored = 0;
    const fLostRows: string[] = [];
    for (const row of fr) {
      const pts = row.points || 0;
      if (pts <= 0) continue;
      fScored += pts;
      if (attributeRow(row) === null) {
        fLost += pts;
        fLostRows.push(`+${pts} ${row.reason}`);
        const k = sig(row.reason);
        const e = nullFounderSig.get(k) ?? { count: 0, points: 0, ex: row.reason };
        e.count++;
        e.points += pts;
        nullFounderSig.set(k, e);
      }
    }
    fLostTot += fLost;
    fScoredTot += fScored;
    if (fLost >= 25 && r.founder_score >= 40) bigFounderLosers.push({ who, lost: fLost, of: fScored, rows: fLostRows });

    // lost investor signal
    let iLost = 0,
      iScored = 0;
    const iLostRows: string[] = [];
    for (const row of ir) {
      const pts = row.points || 0;
      if (pts <= 0) continue;
      iScored += pts;
      if (attributeInvestorRow(row) === null) {
        iLost += pts;
        iLostRows.push(`+${pts} ${row.reason}`);
        const k = sig(row.reason);
        const e = nullInvestorSig.get(k) ?? { count: 0, points: 0, ex: row.reason };
        e.count++;
        e.points += pts;
        nullInvestorSig.set(k, e);
      }
    }
    iLostTot += iLost;
    iScoredTot += iScored;
    if (iLost >= 25 && r.investor_score >= 40) bigInvestorLosers.push({ who, lost: iLost, of: iScored, rows: iLostRows });

    // domination (founder + investor vectors)
    const checkDom = (bucket: Record<string, { points: number; rows: BreakdownRow[] }>, dim: string) => {
      for (const [vec, b] of Object.entries(bucket)) {
        if (b.points < 60 || b.rows.length === 0) continue; // only meaningful, multi-point vectors
        const top = b.rows.slice().sort((a, z) => z.points - a.points)[0];
        const share = top.points / b.points;
        if (share >= 0.85 && b.rows.length >= 2) {
          dominated.push({ who, vec: `${dim}:${vec}`, row: top.reason, pts: top.points, share });
        }
      }
    };
    checkDom(bucketByVector(fr) as Record<string, { points: number; rows: BreakdownRow[] }>, "F");
    checkDom(bucketInvestorByVector(ir) as Record<string, { points: number; rows: BreakdownRow[] }>, "I");
  }

  const pct = (a: number, b: number) => (b === 0 ? "0" : ((100 * a) / b).toFixed(1));
  console.log("## (1) LOST SIGNAL — points that score but hit NO radar vector");
  console.log(
    `Founder: ${fLostTot} of ${fScoredTot} founder points lost (${pct(fLostTot, fScoredTot)}%) across ${bigFounderLosers.length} profiles losing ≥25.`,
  );
  console.log(
    `Investor: ${iLostTot} of ${iScoredTot} investor points lost (${pct(iLostTot, iScoredTot)}%) across ${bigInvestorLosers.length} profiles losing ≥25.\n`,
  );

  const top = (m: Map<string, { count: number; points: number; ex: string }>, n: number) =>
    [...m.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, n);

  console.log("### Top FOUNDER null-attribution reason shapes (the rule gaps):");
  for (const [k, v] of top(nullFounderSig, 12)) {
    console.log(`  ${v.points}pts / ${v.count}x  «${v.ex.slice(0, 90)}»`);
  }
  console.log("\n### Top INVESTOR null-attribution reason shapes:");
  for (const [k, v] of top(nullInvestorSig, 12)) {
    console.log(`  ${v.points}pts / ${v.count}x  «${v.ex.slice(0, 90)}»`);
  }

  console.log("\n## (2) SINGLE-ROW DOMINATION (1 row ≥85% of a ≥60pt vector)");
  console.log(`${dominated.length} vector instances.`);
  for (const d of dominated.sort((a, b) => b.pts - a.pts).slice(0, 20)) {
    console.log(`  ${d.who}  ${d.vec}  ${d.pts}pts (${(d.share * 100).toFixed(0)}%)  «${d.row.slice(0, 80)}»`);
  }

  console.log("\n## (1b) Biggest individual LOST-SIGNAL profiles (founder):");
  for (const p of bigFounderLosers.sort((a, b) => b.lost - a.lost).slice(0, 12)) {
    console.log(`  ${p.who}: lost ${p.lost} of ${p.of}`);
    for (const rr of p.rows.slice(0, 3)) console.log(`      ${rr.slice(0, 100)}`);
  }
  console.log("\n## (1c) Biggest individual LOST-SIGNAL profiles (investor):");
  for (const p of bigInvestorLosers.sort((a, b) => b.lost - a.lost).slice(0, 12)) {
    console.log(`  ${p.who}: lost ${p.lost} of ${p.of}`);
    for (const rr of p.rows.slice(0, 3)) console.log(`      ${rr.slice(0, 100)}`);
  }
}

main().then(() => process.exit(0));
