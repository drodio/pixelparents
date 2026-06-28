// Smoke-test the Hugging Face enricher against live HF Hub APIs (no auth needed).
//   npx tsx scripts/test-huggingface.mjs
//
// Proves four things:
//   1. Known-URL path: trusts a bare huggingface.co/<username> URL from Exa.
//   2. Clement Delangue (CEO, handle "clem") via known URL.
//   3. Derived-candidate precision guard: julien-c cannot be derived from
//      "Julien Chaumond" alone — correct that we return 0 facts (recall loss
//      is acceptable; false attribution is worse).
//   4. Bogus name guard: totally unknown person returns 0 facts.

import { enrichWithHuggingFace } from "../src/lib/enrichers/huggingface.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "Julien Chaumond via known URL — expect RICH data",
    ctx: ctx("Julien Chaumond"),
    urls: ["https://huggingface.co/julien-c"],
    expect: "rich",
  },
  {
    label: "Clement Delangue (CEO) via known URL — expect RICH data",
    ctx: ctx("Clement Delangue"),
    urls: ["https://huggingface.co/clem"],
    expect: "rich",
  },
  {
    label: "Julien Chaumond derived only (no URL) — expect EMPTY (precision guard: 'julien-c' not derivable from name)",
    ctx: ctx("Julien Chaumond", "julienchaumond"),
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
