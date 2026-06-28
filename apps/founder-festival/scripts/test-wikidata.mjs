// Smoke-test the Wikidata enricher against the live Wikidata API (no auth).
//   npx tsx scripts/test-wikidata.mjs
//
// Proves four things:
//   1. Rich structured data via the name search path.
//   2. Rich data via a known Wikidata URL (known-URL path).
//   3. Rich data on a second subject via the name search path.
//   4. Bogus name returns empty (precision guard).

import { enrichWithWikidata } from "../src/lib/enrichers/wikidata.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

// A subject's Wikidata Qid, e.g. https://www.wikidata.org/wiki/Q000000
const SUBJECT_WIKIDATA_URL = "https://www.wikidata.org/wiki/Q000000";

const CASES = [
  {
    label: "Jordan Lee — name search (expect RICH structured data)",
    ctx: ctx("Jordan Lee"),
    urls: [],
    expect: "rich",
  },
  {
    label: "Jordan Lee — known Wikidata URL (expect RICH, highest trust path)",
    ctx: ctx("Jordan Lee"),
    urls: [SUBJECT_WIKIDATA_URL],
    expect: "rich",
  },
  {
    label: "Alex Kim — name search (expect RICH structured data)",
    ctx: ctx("Alex Kim"),
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
