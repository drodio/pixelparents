// Smoke-test the NFX Signal enricher against well-known investors + a negative
// control. NFX is now a DIRECT GraphQL scraper (signal-api.nfx.com, Bearer
// NFX_SIGNAL_TOKEN) — free, no Apify. Each investor = 1 search + 1 profile call.
// Expected (when the lookup name maps to a listed investor): a fund name plus a
// portfolio count; a name that is not NFX-listed returns zero facts.
//
//   npx tsx --env-file=.env.local scripts/test-nfx.mjs

import { enrichWithNfx } from "../src/lib/enrichers/nfx.ts";

const SUBJECTS = [
  { fullName: "Jordan Lee" },
  { fullName: "Alex Kim" },
  { fullName: "Casey Morgan" },
  // Negative control: a name that is NOT an NFX-listed investor. Should
  // return zero facts (precision check — no false attribution).
  { fullName: "Taylor Rivera" },
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
