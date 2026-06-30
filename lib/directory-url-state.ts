// Pure, client-safe helpers that sync the directory's shareable filters to/from
// the URL query string. Kept here (not inline in directory-client.tsx) so the
// parse/serialize logic is deterministic and unit-testable.
//
// PRIVACY: the "Near me" geolocation/radius filter is intentionally NOT part of
// this state. A user's location must never be written into a shareable URL.

export type DirectorySortKey = "name" | "child";
export type DirectorySortDir = "asc" | "desc";

// Age slider bounds, mirrored from directory-client.tsx. Kept here so parsing can
// clamp without importing the client component.
export const AGE_MIN = 1;
export const AGE_MAX = 18;

// Defaults — a parsed state equal to these means "no filters", and serialize()
// omits any field at its default so the canonical no-filter URL has no params.
export const DEFAULT_SORT_KEY: DirectorySortKey = "name";
export const DEFAULT_SORT_DIR: DirectorySortDir = "asc";
export const DEFAULT_PER_ROW = 3;

// Bounds for the persisted "per row" choice. The grid clamps the effective value
// to what fits the viewport at render time; this only guards the stored number
// against absurd/malformed URL values.
const PER_ROW_MIN = 1;
const PER_ROW_MAX = 10;

export type DirectoryUrlState = {
  query: string;
  // Interest filter keys (lowercased), already validated against known interests
  // and de-duplicated, order preserved.
  interests: string[];
  sortKey: DirectorySortKey;
  sortDir: DirectorySortDir;
  ageLower: number;
  ageUpper: number;
  perRow: number;
};

export function defaultUrlState(): DirectoryUrlState {
  return {
    query: "",
    interests: [],
    sortKey: DEFAULT_SORT_KEY,
    sortDir: DEFAULT_SORT_DIR,
    ageLower: AGE_MIN,
    ageUpper: AGE_MAX,
    perRow: DEFAULT_PER_ROW,
  };
}

// Clamp a parsed integer param into [lo, hi]; returns `fallback` when the value
// is missing or not a finite number.
function clampInt(value: string | null, lo: number, hi: number, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// Parse the URL query string into a fully-validated filter state. Malformed or
// unknown params fall back to defaults — never throws.
//
// `validInterestKeys` is the set of lowercased interest keys that actually exist
// on the current cards; only those survive parsing (a stale/typo'd interest in a
// shared link is silently dropped).
export function parseUrlState(
  params: URLSearchParams,
  validInterestKeys: Set<string>,
): DirectoryUrlState {
  const state = defaultUrlState();

  const q = params.get("q");
  if (q) state.query = q;

  const interestsRaw = params.get("interests");
  if (interestsRaw) {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const part of interestsRaw.split(",")) {
      const key = part.trim().toLowerCase();
      if (!key || seen.has(key) || !validInterestKeys.has(key)) continue;
      seen.add(key);
      kept.push(key);
    }
    state.interests = kept;
  }

  const sort = params.get("sort");
  if (sort === "name" || sort === "child") state.sortKey = sort;

  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") state.sortDir = dir;

  // Age range, encoded "lo-hi" (e.g. "6-12"). Both bounds are clamped to the
  // slider's valid range and normalized so lower <= upper. A malformed value
  // leaves the default "all ages".
  const age = params.get("age");
  if (age) {
    const m = age.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m) {
      let lo = Math.min(AGE_MAX, Math.max(AGE_MIN, Number.parseInt(m[1], 10)));
      let hi = Math.min(AGE_MAX, Math.max(AGE_MIN, Number.parseInt(m[2], 10)));
      if (lo > hi) [lo, hi] = [hi, lo];
      state.ageLower = lo;
      state.ageUpper = hi;
    }
  }

  state.perRow = clampInt(params.get("perRow"), PER_ROW_MIN, PER_ROW_MAX, DEFAULT_PER_ROW);

  return state;
}

// Serialize filter state back into a URLSearchParams, OMITTING any field at its
// default so the no-filter view produces an empty query string (i.e. behaves
// exactly like today's bare /directory). Output key order is stable for tidy,
// diff-friendly URLs.
export function serializeUrlState(state: DirectoryUrlState): URLSearchParams {
  const params = new URLSearchParams();

  const q = state.query.trim();
  if (q) params.set("q", q);

  if (state.interests.length > 0) params.set("interests", state.interests.join(","));

  if (state.sortKey !== DEFAULT_SORT_KEY) params.set("sort", state.sortKey);
  if (state.sortDir !== DEFAULT_SORT_DIR) params.set("dir", state.sortDir);

  // Only encode the age range when it's actually narrowed from the full span.
  if (state.ageLower > AGE_MIN || state.ageUpper < AGE_MAX) {
    params.set("age", `${state.ageLower}-${state.ageUpper}`);
  }

  if (state.perRow !== DEFAULT_PER_ROW) params.set("perRow", String(state.perRow));

  return params;
}
