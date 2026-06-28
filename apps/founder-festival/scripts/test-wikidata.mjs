// Smoke-test the Wikidata enricher against the live Wikidata API (no auth).
//   npx tsx scripts/test-wikidata.mjs
//
// Proves four things:
//   1. Rich structured data on Patrick Collison (name search path).
//   2. Rich data via a known Wikidata URL (known-URL path).
//   3. Rich data on Brian Chesky (name search path).
//   4. Bogus name returns empty (precision guard).

import { enrichWithWikidata } from "../src/lib/enrichers/wikidata.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

// Patrick Collison's Wikidata Qid is Q7146257
// https://www.wikidata.org/wiki/Q7146257
const PATRICK_WIKIDATA_URL = "https://www.wikidata.org/wiki/Q7146257";

const CASES = [
  {
    label: "Patrick Collison — name search (expect RICH structured data)",
    ctx: ctx("Patrick Collison"),
    urls: [],
    expect: "rich",
  },
  {
    label: "Patrick Collison — known Wikidata URL (expect RICH, highest trust path)",
    ctx: ctx("Patrick Collison"),
    urls: [PATRICK_WIKIDATA_URL],
    expect: "rich",
  },
  {
    label: "Brian Chesky — name search (expect RICH structured data)",
    ctx: ctx("Brian Chesky"),
    urls: [],
    expect: "rich",
  },
  {
    label: "Zxqv Notarealperson — bogus name (expect EMPTY)",
    ctx: ctx("Zxqv Notarealperson"),
    urls: [],
    expect: "empty",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label, `(expect: ${c.expect})`);
  const r = await enrichWithWikidata(c.ctx, c.urls);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.citations.length > 0) console.log("citations:", r.citations);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
}
console.log("=".repeat(72));
