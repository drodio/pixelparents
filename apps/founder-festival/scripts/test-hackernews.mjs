// Smoke-test the Hacker News enricher against the live HN APIs (no auth).
//   npx tsx scripts/test-hackernews.mjs
//
// Proves two things:
//   1. Rich data on a confirmed handle (karma, post/comment counts, top posts).
//   2. The identity guard: a derived handle that doesn't corroborate is
//      REJECTED (the `naval` handle has 113 karma + empty bio, and is NOT
//      Naval Ravikant — we must not attribute it to him).

import { enrichWithHackerNews } from "../src/lib/enrichers/hackernews.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "pg via Exa-surfaced HN URL — expect RICH data",
    ctx: ctx("Paul Graham"),
    urls: ["https://news.ycombinator.com/user?id=pg"],
    expect: "rich",
  },
  {
    label: "Naval derived, no URL — expect REJECTED (naval handle != Naval Ravikant)",
    ctx: ctx("Naval Ravikant"),
    urls: [],
    expect: "empty",
  },
  {
    label: "Naval via Exa HN URL — expect data (we trust Exa-surfaced URLs)",
    ctx: ctx("Naval Ravikant"),
    urls: ["https://news.ycombinator.com/user?id=naval"],
    expect: "rich-ish",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label, `(expect: ${c.expect})`);
  const r = await enrichWithHackerNews(c.ctx, c.urls);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw));
}
console.log("=".repeat(72));
