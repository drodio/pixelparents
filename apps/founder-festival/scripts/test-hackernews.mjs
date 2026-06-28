// Smoke-test the Hacker News enricher against the live HN APIs (no auth).
//   npx tsx scripts/test-hackernews.mjs
//
// Proves two things:
//   1. Rich data on a confirmed handle (karma, post/comment counts, top posts).
//   2. The identity guard: a derived handle that doesn't corroborate is
//      REJECTED (a low-karma, empty-bio handle that merely resembles the name
//      is NOT the same person — we must not attribute it to them).

import { enrichWithHackerNews } from "../src/lib/enrichers/hackernews.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "known handle via Exa-surfaced HN URL — expect RICH data",
    ctx: ctx("Jordan Lee"),
    urls: ["https://news.ycombinator.com/user?id=jordanlee"],
    expect: "rich",
  },
  {
    label: "derived, no URL — expect REJECTED (derived handle != the person)",
    ctx: ctx("Alex Kim"),
    urls: [],
    expect: "empty",
  },
  {
    label: "via Exa HN URL — expect data (we trust Exa-surfaced URLs)",
    ctx: ctx("Alex Kim"),
    urls: ["https://news.ycombinator.com/user?id=alexkim"],
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
