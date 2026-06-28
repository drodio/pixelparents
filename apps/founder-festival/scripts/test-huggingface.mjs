// Smoke-test the Hugging Face enricher against live HF Hub APIs (no auth needed).
//   npx tsx scripts/test-huggingface.mjs
//
// Proves four things:
//   1. Known-URL path: trusts a bare huggingface.co/<username> URL from Exa.
//   2. A platform CEO (handle that differs from the name) via known URL.
//   3. Derived-candidate precision guard: a username that cannot be derived from
//      the name alone — correct that we return 0 facts (recall loss is
//      acceptable; false attribution is worse).
//   4. Bogus name guard: totally unknown person returns 0 facts.

import { enrichWithHuggingFace } from "../src/lib/enrichers/huggingface.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "Jordan Lee via known URL — expect RICH data",
    ctx: ctx("Jordan Lee"),
    urls: ["https://huggingface.co/jordanlee"],
    expect: "rich",
  },
  {
    label: "Alex Kim (CEO) via known URL — expect RICH data",
    ctx: ctx("Alex Kim"),
    urls: ["https://huggingface.co/alexkim"],
    expect: "rich",
  },
  {
    label: "Jordan Lee derived only (no URL) — expect EMPTY (precision guard: handle not derivable from name)",
    ctx: ctx("Jordan Lee", "jordanleehf"),
    urls: [],
    expect: "empty",
  },
  {
    label: "Bogus name 'Zxqv Notarealperson' — expect EMPTY (0 facts)",
    ctx: ctx("Zxqv Notarealperson"),
    urls: [],
    expect: "empty",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label, `(expect: ${c.expect})`);
  const r = await enrichWithHuggingFace(c.ctx, c.urls);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.citations.length > 0) console.log("citations:", r.citations);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
}
console.log("=".repeat(72));
