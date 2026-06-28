// Smoke-test the npm enricher against the live npm registry (no auth).
//   npx tsx scripts/test-npm.mjs
//
// Covers:
//   1. Derived handle + author-name corroboration (Sindre Sorhus; sindresorhus
//      is extremely prolific and his packages include author.name in the manifest).
//   2. Known-URL path (sindresorhus via explicit npmjs.com/~sindresorhus URL).
//   3. Founder example with derived handle (Guillermo Rauch / rauchg).
//   4. Bogus name — must return 0 facts.
//
// NOTE on expected behaviour:
//   • The derived+corroboration path works for prolific solo authors whose packages
//     include `author.name` in the registry manifest (e.g. Sindre Sorhus).
//   • For org-maintained packages (Vercel's next.js etc.) the `author` field is
//     often absent, so derived candidates get DROPPED — expected & correct.
//     In that case only the known-URL path reliably returns data.

import { enrichWithNpm } from "../src/lib/enrichers/npm.ts";

function ctx(fullName, linkedinHandle = "") {
  return { linkedinUrl: "", linkedinHandle, linkedinPageText: "", searchHighlights: [], fullName };
}

const CASES = [
  {
    label: "Sindre Sorhus — derived handle (sindresorhus), corroborated via author.name",
    ctx: ctx("Sindre Sorhus", "sindresorhus"),
    urls: [],
    expect: "rich (1000+ packages)",
  },
  {
    label: "Sindre Sorhus — known-URL path (npmjs.com/~sindresorhus)",
    ctx: ctx("Sindre Sorhus"),
    urls: ["https://www.npmjs.com/~sindresorhus"],
    expect: "rich (known URL, no corroboration required)",
  },
  {
    label: "Guillermo Rauch (rauchg) — derived handle, may be dropped if no author.name",
    ctx: ctx("Guillermo Rauch", "rauchg"),
    urls: [],
    expect: "either rich (if corroborated) or empty (if org packages lack author.name)",
  },
  {
    label: "Guillermo Rauch — known-URL path (npmjs.com/~rauchg)",
    ctx: ctx("Guillermo Rauch"),
    urls: ["https://www.npmjs.com/~rauchg"],
    expect: "rich (240+ packages via known URL)",
  },
  {
    label: "Bogus person (Zxqv Notarealperson) — must return 0 facts",
    ctx: ctx("Zxqv Notarealperson"),
    urls: [],
    expect: "empty",
  },
];

for (const c of CASES) {
  console.log("=".repeat(72));
  console.log(c.label);
  console.log(`expect: ${c.expect}`);
  const r = await enrichWithNpm(c.ctx, c.urls);
  console.log(`facts (${r.facts.length}):`);
  for (const f of r.facts) console.log("  •", f);
  if (r.citations.length) console.log("citations:", r.citations);
  if (r.raw) console.log("raw:", JSON.stringify(r.raw, null, 2));
}
console.log("=".repeat(72));
