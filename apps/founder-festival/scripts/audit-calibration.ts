// Read-only calibration + spider-graph + data-quality audit over PROD.
// Run: npx tsx scripts/audit-calibration.ts prod
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const target = process.argv[2] ?? "prod";

function q(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}
function stats(label: string, arr: number[]) {
  const s = arr.slice().sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  console.log(
    `  ${label.padEnd(10)} n=${arr.length} min=${s[0]} p25=${q(s, 25)} med=${q(s, 50)} p75=${q(s, 75)} p90=${q(s, 90)} p95=${q(s, 95)} p99=${q(s, 99)} max=${s[s.length - 1]} mean=${Math.round(mean)}`,
  );
}

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
  if (!conn) throw new Error(`no conn for ${target}`);
  const host = conn.match(/ep-[a-z-]+/)?.[0];
  if (target === "prod" && !/ep-fragrant-surf/.test(conn)) throw new Error(`prod expected, got ${host}`);
  const sql = neon(conn);
  const cv = await import("../src/lib/credibility-vectors");
  const { founderRows, investorRows, rawVectorPoints, rawInvestorVectorPoints, attributeRow, attributeInvestorRow, VECTOR_KEYS, INVESTOR_VECTOR_KEYS } = cv;

  console.log(`# Calibration / spider / quality audit — ${target} (${host})\n`);

  const rows = (await sql`
    SELECT id, slug, full_name, founder_score, investor_score, signal_quality, source, breakdown,
           founder_status, investor_status, canonical_industries
    FROM evaluations`) as any[];
  const scored = rows.filter((r) => r.signal_quality !== "low" && r.source !== "code");
  console.log(`Total rows=${rows.length}  scored(non-low,non-code)=${scored.length}\n`);

  // ---- signal_quality + source distribution
  const byQ: Record<string, number> = {};
  const bySrc: Record<string, number> = {};
  for (const r of rows) {
    byQ[r.signal_quality] = (byQ[r.signal_quality] ?? 0) + 1;
    bySrc[r.source] = (bySrc[r.source] ?? 0) + 1;
  }
  console.log("## signal_quality:", JSON.stringify(byQ));
  console.log("## source:", JSON.stringify(bySrc), "\n");

  // ---- score-total calibration
  console.log("## Score totals (scored population)");
  stats("founder", scored.map((r) => r.founder_score || 0));
  stats("investor", scored.map((r) => r.investor_score || 0));
  // founder score WITHOUT the giant valuation/traction rows, to see the "skill" floor
  const fNonTraction = scored.map((r) => {
    const b = rawVectorPoints(founderRows(r.breakdown));
    return (b.technical + b.operator + b.domain + b.gtm) | 0;
  });
  stats("f(non-trac)", fNonTraction);
  console.log("");

  // ---- spider coverage: % with raw>0 per axis, + distribution among signal-havers
  console.log("## Founder axis coverage (raw>0) + points among signal-havers");
  for (const k of VECTOR_KEYS) {
    const vals = scored.map((r) => rawVectorPoints(founderRows(r.breakdown))[k]);
    const havers = vals.filter((v) => v > 0);
    console.log(`  ${k.padEnd(10)} coverage=${((100 * havers.length) / scored.length).toFixed(1)}% (${havers.length})  among-havers: med=${q(havers.slice().sort((a,b)=>a-b),50)} p90=${q(havers.slice().sort((a,b)=>a-b),90)} max=${Math.max(0,...havers)}`);
  }
  console.log("## Investor axis coverage");
  const inv = scored.filter((r) => (r.investor_score || 0) > 0);
  for (const k of INVESTOR_VECTOR_KEYS) {
    const vals = inv.map((r) => rawInvestorVectorPoints(investorRows(r.breakdown))[k]);
    const havers = vals.filter((v) => v > 0);
    console.log(`  ${k.padEnd(10)} coverage=${((100 * havers.length) / (inv.length||1)).toFixed(1)}% of ${inv.length} investors  among-havers: med=${q(havers.slice().sort((a,b)=>a-b),50)} p90=${q(havers.slice().sort((a,b)=>a-b),90)} max=${Math.max(0,...havers)}`);
  }
  console.log("");

  // ---- lost-signal recheck (should be lower after the attribution fixes)
  let fLost = 0, fTot = 0, iLost = 0, iTot = 0;
  for (const r of scored) {
    for (const row of founderRows(r.breakdown)) { const p = row.points||0; if (p>0){ fTot+=p; if(!attributeRow(row)) fLost+=p; } }
    for (const row of investorRows(r.breakdown)) { const p = row.points||0; if (p>0){ iTot+=p; if(!attributeInvestorRow(row)) iLost+=p; } }
  }
  console.log("## Lost-signal (post-fix recheck)");
  console.log(`  founder: ${fLost}/${fTot} = ${((100*fLost)/fTot).toFixed(2)}% unattributed`);
  console.log(`  investor: ${iLost}/${iTot} = ${((100*iLost)/iTot).toFixed(2)}% unattributed\n`);

  // ---- top founders + dominant vector
  console.log("## Top 15 founders by score (dominant founder axis)");
  for (const r of scored.slice().sort((a,b)=>(b.founder_score||0)-(a.founder_score||0)).slice(0,15)) {
    const b = rawVectorPoints(founderRows(r.breakdown));
    const top = VECTOR_KEYS.map((k)=>[k,b[k]] as const).sort((a,z)=>z[1]-a[1])[0];
    console.log(`  ${String(r.founder_score).padStart(8)}  ${(r.slug??r.full_name??"?").padEnd(22)} dom=${top[0]}(${top[1]})`);
  }
  console.log("");

  // ---- duplicate detection (same full_name scored twice)
  const byName: Record<string, any[]> = {};
  for (const r of rows) { const n=(r.full_name||"").trim().toLowerCase(); if(n) (byName[n] ??= []).push(r); }
  const dupes = Object.entries(byName).filter(([,v])=>v.length>1);
  console.log(`## Duplicate full_names: ${dupes.length} names with >1 row`);
  for (const [n,v] of dupes.slice(0,15)) console.log(`  "${n}" ×${v.length}  [${v.map((x)=>x.slug??x.id.slice(0,8)).join(", ")}]`);
  console.log("");

  // ---- industry coverage
  const withInd = scored.filter((r)=>(r.canonical_industries??[]).length>0);
  console.log(`## canonical_industries populated: ${withInd.length}/${scored.length} (${((100*withInd.length)/scored.length).toFixed(1)}%)`);

  // ---- status coverage
  const fStatus: Record<string,number> = {}; const iStatus: Record<string,number> = {};
  for (const r of scored){ fStatus[String(r.founder_status)] = (fStatus[String(r.founder_status)]??0)+1; iStatus[String(r.investor_status)] = (iStatus[String(r.investor_status)]??0)+1; }
  console.log("## founder_status:", JSON.stringify(fStatus));
  console.log("## investor_status:", JSON.stringify(iStatus));
}
main().then(()=>process.exit(0));
