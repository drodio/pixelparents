// One-off: merge case-variant duplicate interests across the whole DB.
//
// "Mountain Biking" and "mountain biking" are the same interest typed with
// different capitalization. This collapses every case-variant group to a single
// canonical spelling (the most-used one) across both signups.parent_interests
// and children.interests, preserving the interest on every profile that has it
// and removing the duplicate. Idempotent and surgical — it only rewrites the two
// interest array columns, and only on rows that actually change. While here it
// also trims each entry and drops blanks, so a row with only whitespace/empty
// cruft (no case-variant) is cleaned up too.
//
// The canonicalization rules below (`key`, `pickCanonicalFromCounts`) are
// intentionally duplicated from lib/interests.ts: this is a standalone .mjs
// one-off and can't import the TS module. Keep the two in sync if the tie-break
// rule changes.
//
// Dry run (default): prints what WOULD change.
//   DATABASE_URL=... node scripts/dedupe-interests.mjs
// Apply the changes:
//   DATABASE_URL=... node scripts/dedupe-interests.mjs --apply
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const sql = neon(url);

const key = (s) => s.trim().toLowerCase();

// Most-used spelling wins; ties prefer a leading capital, then alphabetical.
function pickCanonicalFromCounts(counts) {
  let best = null;
  let bestCount = -1;
  for (const [spelling, count] of counts) {
    if (best === null) {
      best = spelling;
      bestCount = count;
      continue;
    }
    if (count !== bestCount) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
      continue;
    }
    const a = /^[A-Z]/.test(best) ? 0 : 1;
    const b = /^[A-Z]/.test(spelling) ? 0 : 1;
    if (b < a || (b === a && spelling.localeCompare(best) < 0)) best = spelling;
  }
  return best ?? "";
}

function canonicalizeRow(arr, canonical) {
  const out = [];
  const seen = new Set();
  for (const raw of arr ?? []) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(canonical.get(k) ?? s);
  }
  return out;
}

const sameArray = (a, b) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// 1. Pull every interest row.
const parents = await sql`SELECT id, parent_interests FROM signups`;
const kids = await sql`SELECT id, interests FROM children`;

// 2. Build the global canonical map, weighting each spelling by how often it
//    appears across all rows.
const groups = new Map();
const tally = (arr) => {
  for (const raw of arr ?? []) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s) continue;
    const k = key(s);
    let counts = groups.get(k);
    if (!counts) {
      counts = new Map();
      groups.set(k, counts);
    }
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
};
for (const r of parents) tally(r.parent_interests);
for (const r of kids) tally(r.interests);

const canonical = new Map();
let dupGroups = 0;
for (const [k, counts] of groups) {
  canonical.set(k, pickCanonicalFromCounts(counts));
  if (counts.size > 1) {
    dupGroups++;
    const variants = [...counts.entries()].map(([s, n]) => `${JSON.stringify(s)}×${n}`).join(", ");
    console.log(`  dup group: ${variants}  ->  ${JSON.stringify(canonical.get(k))}`);
  }
}
console.log(`\nFound ${groups.size} distinct interests, ${dupGroups} with case-variants.`);

// 3. Rewrite only the rows that change.
let parentUpdates = 0;
for (const r of parents) {
  const cur = (r.parent_interests ?? []).filter((x) => typeof x === "string");
  const next = canonicalizeRow(r.parent_interests, canonical);
  if (!sameArray(cur, next)) {
    parentUpdates++;
    if (apply) {
      await sql`UPDATE signups SET parent_interests = ${next.length ? next : null} WHERE id = ${r.id}`;
    }
  }
}

let childUpdates = 0;
for (const r of kids) {
  const cur = (r.interests ?? []).filter((x) => typeof x === "string");
  const next = canonicalizeRow(r.interests, canonical);
  if (!sameArray(cur, next)) {
    childUpdates++;
    if (apply) {
      await sql`UPDATE children SET interests = ${next.length ? next : null} WHERE id = ${r.id}`;
    }
  }
}

console.log(
  `\n${apply ? "Updated" : "Would update"} ${parentUpdates} signup row(s) and ${childUpdates} child row(s).`,
);
if (!apply && parentUpdates + childUpdates > 0) {
  console.log("Re-run with --apply to write these changes.");
}
