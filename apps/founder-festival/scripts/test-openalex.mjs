// Smoke-test the OpenAlex enricher against the live OpenAlex API (no auth).
//   npx tsx scripts/test-openalex.mjs
//
// Proves three things:
//   1. Rich data on a prominent research founder (Fei-Fei Li, Andrew Ng).
//   2. The identity guard: a bogus name returns 0 facts.
//   3. The citation-threshold gate: a non-academic founder (Brian Chesky)
//      is blocked even when nameOverlaps would accept the display_name.

import { enrichWithOpenAlex } from "../src/lib/enrichers/openalex.ts";

function ctx(fullName, linkedinPageText = "") {
  return {
    linkedinUrl: "",
    linkedinHandle: "",
    linkedinPageText,
    searchHighlights: [],
    fullName,
  };
}

const CASES = [
  {
    label: "Fei-Fei Li (Stanford AI; huge citations) — expect RICH data",
    ctx: ctx("Fei-Fei Li", "stanford university professor computer science"),
    expect: "rich",
  },
  {
    label: "Andrew Ng (Coursera/DeepLearning.AI founder; huge citations) — expect RICH data",
    ctx: ctx("Andrew Ng", "stanford deep learning coursera"),
    expect: "rich",
  },
  {
    label: 'Zxqv Notarealperson (bogus) — expect 0 facts',
    ctx: ctx("Zxqv Notarealperson"),
    expect: "empty",
  },
  {
    label: "Brian Chesky (Airbnb; non-academic) — expect 0 facts (citation gate)",
    ctx: ctx("Brian Chesky"),
    expect: "empty",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label, `(expect: ${c.expect})`);
  const r = await enrichWithOpenAlex(c.ctx);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.citations.length > 0) console.log("citations:", r.citations);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw));
}
console.log("=".repeat(72));
