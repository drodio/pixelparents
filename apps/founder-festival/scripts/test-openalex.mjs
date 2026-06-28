// Smoke-test the OpenAlex enricher against the live OpenAlex API (no auth).
//   npx tsx scripts/test-openalex.mjs
//
// Proves three things:
//   1. Rich data on a prominent research founder (heavily-cited academic).
//   2. The identity guard: a bogus name returns 0 facts.
//   3. The citation-threshold gate: a non-academic founder is blocked even
//      when nameOverlaps would accept the display_name.

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
    label: "Jordan Lee (academic; huge citations) — expect RICH data",
    ctx: ctx("Jordan Lee", "university professor computer science"),
    expect: "rich",
  },
  {
    label: "Alex Kim (academic founder; huge citations) — expect RICH data",
    ctx: ctx("Alex Kim", "deep learning research"),
    expect: "rich",
  },
  {
    label: 'Zxqv Notarealperson (bogus) — expect 0 facts',
    ctx: ctx("Zxqv Notarealperson"),
    expect: "empty",
  },
  {
    label: "Taylor Rivera (non-academic founder) — expect 0 facts (citation gate)",
    ctx: ctx("Taylor Rivera"),
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
