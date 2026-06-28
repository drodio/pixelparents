// Smoke-test the Stack Overflow enricher against the live Stack Exchange API
// (no auth required — free tier, gzip auto-decompressed by Node fetch).
//
//   npx tsx scripts/test-stackoverflow.mjs
//
// Proves four things:
//   1. Known-URL path: user_id extracted from a URL → direct lookup (highest trust).
//   2. Name-search path: a high-rep user found by name.
//   3. Name-search path: another well-known user found by name.
//   4. Precision gate: a bogus name returns 0 facts (no false attribution).

import { enrichWithStackOverflow } from "../src/lib/enrichers/stackoverflow.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "Jordan Lee via known SO URL (user_id path) — expect RICH data",
    ctx: ctx("Jordan Lee"),
    urls: ["https://stackoverflow.com/users/12345/jordan-lee"],
    expect: "rich",
  },
  {
    label: "Jordan Lee via name search (no URL) — expect RICH data",
    ctx: ctx("Jordan Lee"),
    urls: [],
    expect: "rich",
  },
  {
    label: "Alex Kim via name search — expect RICH data",
    ctx: ctx("Alex Kim"),
    urls: [],
    expect: "rich",
  },
  {
    label: "Zxqv Notarealperson — expect EMPTY (precision gate)",
    ctx: ctx("Zxqv Notarealperson"),
    urls: [],
    expect: "empty",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label, `(expect: ${c.expect})`);
  const r = await enrichWithStackOverflow(c.ctx, c.urls);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.citations.length) console.log("citations:", r.citations);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
}
console.log("=".repeat(72));
