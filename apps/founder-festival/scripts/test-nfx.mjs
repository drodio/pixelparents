// Smoke-test the NFX Signal enricher against well-known investors + a negative
// control. NFX is now a DIRECT GraphQL scraper (signal-api.nfx.com, Bearer
// NFX_SIGNAL_TOKEN) — free, no Apify. Each investor = 1 search + 1 profile call.
// Expected (validated): Marc Andreessen → a16z $2.2B fund, 77 portfolio;
// Naval Ravikant → ~250 portfolio; Jenny Fielding → Everywhere Ventures, ~419.
//
//   npx tsx --env-file=.env.local scripts/test-nfx.mjs

import { enrichWithNfx } from "../src/lib/enrichers/nfx.ts";

const SUBJECTS = [
  { fullName: "Marc Andreessen" },
  { fullName: "Naval Ravikant" },
  { fullName: "Jenny Fielding" },
  // Negative control: a real person who is NOT an NFX-listed investor. Should
  // return zero facts (precision check — no false attribution).
  { fullName: "Linus Torvalds" },
];

function ctx(fullName) {
  return {
    linkedinUrl: "",
    linkedinHandle: "",
    linkedinPageText: "",
    searchHighlights: [],
    fullName,
  };
}

for (const { fullName } of SUBJECTS) {
  console.log("=".repeat(72));
  console.log("Looking up:", fullName);
  const t0 = Date.now();
  try {
    const r = await enrichWithNfx(ctx(fullName));
    const ms = Date.now() - t0;
    console.log(`facts (${r.facts.length}) — ${ms}ms`);
    for (const f of r.facts) console.log("  •", f);
    console.log("citations:", r.citations);
    if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
  } catch (err) {
    console.log("FAILED:", err.message);
  }
}
