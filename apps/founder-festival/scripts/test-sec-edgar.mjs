// Smoke-test the SEC EDGAR enricher (Form D = authoritative private-raise data).
//   npx tsx scripts/test-sec-edgar.mjs
//
// SEC requires a descriptive User-Agent w/ contact email (set in the enricher).
// Proves the FEAT-01 fix: real, citable capital-raised figures instead of
// LLM-guessed press-snippet sums. Also proves the precision gate (a made-up
// name returns nothing).

import { enrichWithSecEdgar } from "../src/lib/enrichers/sec-edgar.ts";

function ctx(fullName) {
  return { linkedinUrl: "", linkedinHandle: "", linkedinPageText: "", searchHighlights: [], fullName };
}

const SUBJECTS = [
  "Patrick Collison", //   Stripe (operating-company raise, still private)
  "Brian Chesky", //       Airbnb (operating company that IPO'd → expect is_ipo:true)
  "Jenny Fielding", //     Everywhere Ventures (fund manager → expect is_investment_fund:true)
  "Zxqv Notarealfounder", // negative control
];

for (const name of SUBJECTS) {
  console.log("=".repeat(72));
  console.log("Looking up:", name);
  const t0 = Date.now();
  const r = await enrichWithSecEdgar(ctx(name));
  console.log(`facts (${r.facts.length}) — ${Date.now() - t0}ms`);
  for (const f of r.facts) console.log("  •", f);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
}
console.log("=".repeat(72));
