import { sql } from "drizzle-orm";
import { getDb } from "./db";

// --- Case-insensitive canonicalization --------------------------------------
//
// Interests are free text typed by parents/admins, so the same interest shows up
// in mixed casing ("Mountain Biking" vs "mountain biking"). We treat two strings
// as the SAME interest when they match case-insensitively, and collapse every
// case-variant group down to one canonical spelling. These helpers are pure so
// the signup flow, the admin forms, and the one-off scrub script all agree on
// which spelling wins.

const key = (s: string) => s.trim().toLowerCase();

// Pick the winning spelling for a group of case-variants given how often each
// exact spelling occurs. Most-used spelling wins; ties prefer the nicer-looking
// one (leading capital) and then fall back to alphabetical so the choice is
// deterministic regardless of input order.
export function pickCanonicalFromCounts(counts: Map<string, number>): string {
  let best: string | null = null;
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
    // Tie on frequency: prefer a leading capital, then alphabetical.
    const a = /^[A-Z]/.test(best) ? 0 : 1;
    const b = /^[A-Z]/.test(spelling) ? 0 : 1;
    if (b < a || (b === a && spelling.localeCompare(best) < 0)) {
      best = spelling;
    }
  }
  return best ?? "";
}

// Build a lowercase-key -> canonical-spelling map from every spelling seen
// (pass the same spelling multiple times to weight it by frequency).
export function buildCanonicalMap(spellings: Iterable<string>): Map<string, string> {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of spellings) {
    const s = raw.trim();
    if (!s) continue;
    const k = key(s);
    let counts = groups.get(k);
    if (!counts) {
      counts = new Map<string, number>();
      groups.set(k, counts);
    }
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const canonical = new Map<string, string>();
  for (const [k, counts] of groups) canonical.set(k, pickCanonicalFromCounts(counts));
  return canonical;
}

// Map a list of typed interests onto the canonical spellings from `pool`, then
// drop case-insensitive duplicates (keeping first occurrence). Unknown interests
// pass through unchanged so brand-new interests still work.
export function canonicalizeInterests(input: string[], pool: string[]): string[] {
  const canonical = buildCanonicalMap(pool);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = raw.trim();
    if (!s) continue;
    const k = key(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(canonical.get(k) ?? s);
  }
  return out;
}

// Server-side backstop: canonicalize a list of interests against the live pool
// so saves never (re)introduce a case-variant duplicate, regardless of which
// form (picker, comma field, or API) produced them.
export async function canonicalizeAgainstPool(input: string[]): Promise<string[]> {
  if (!input.length) return input;
  try {
    const pool = await getInterestPool();
    return canonicalizeInterests(input, pool);
  } catch (err) {
    console.error("canonicalizeAgainstPool failed:", err);
    return input;
  }
}

// Distinct union of interests entered so far (parents + children). Case-variants
// are collapsed to one canonical spelling (the most-used one) so it never shows a
// duplicate. Degrades to [] if the table doesn't exist yet.
//
// `completedOnly` scopes to COMPLETED signups/families (share_token minted + name
// /email) — used for the landing hero + mosaic so the "N shared interests" number
// matches the other completed-only headline counts (drafts don't inflate it). The
// pill PICKER calls it WITHOUT the flag: it legitimately wants every spelling
// anyone has typed, including in-progress rows, for autocomplete + canonicalization.
export async function getInterestPool(opts?: { completedOnly?: boolean }): Promise<string[]> {
  const signupWhere = opts?.completedOnly
    ? sql`WHERE share_token IS NOT NULL AND btrim(first_name) <> '' AND btrim(email) <> ''`
    : sql``;
  const childWhere = opts?.completedOnly
    ? sql`WHERE EXISTS (SELECT 1 FROM signups s WHERE s.family_id = children.family_id AND s.share_token IS NOT NULL AND btrim(s.first_name) <> '' AND btrim(s.email) <> '')`
    : sql``;
  try {
    const result = await getDb().execute(sql`
      SELECT t.i AS interest
      FROM (
        SELECT unnest(parent_interests) AS i FROM signups ${signupWhere}
        UNION ALL
        SELECT unnest(interests) AS i FROM children ${childWhere}
      ) t
      WHERE t.i IS NOT NULL AND t.i <> ''
    `);
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    const spellings = rows
      .map((r) => (typeof r.interest === "string" ? r.interest : ""))
      .filter(Boolean);
    const canonical = buildCanonicalMap(spellings);
    return [...new Set(canonical.values())].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  } catch (err) {
    console.error("getInterestPool failed:", err);
    return [];
  }
}
