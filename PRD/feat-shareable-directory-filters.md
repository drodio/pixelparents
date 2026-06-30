## Progress Update as of June 29, 2026 — 8:20 PM Pacific

### Summary of changes since last update
First entry for `feat/shareable-directory-filters`. Made the OHS family
directory's key filters URL-persisted so a filtered view is bookmarkable and
shareable (e.g. paste a "11th-grade families into robotics" link into the
community WhatsApp). Purely a state↔URL sync — no visual/layout change, and the
bare `/directory` URL (no params) behaves exactly as before. The "Near me"
geolocation/radius filter is deliberately left ephemeral (privacy: a user's
location must never appear in a shareable URL).

### Detail of changes made
- **New pure helper `lib/directory-url-state.ts`** — `parseUrlState(params,
  validInterestKeys)` and `serializeUrlState(state)` plus `defaultUrlState()` and
  exported `AGE_MIN`/`AGE_MAX`/default constants. Persisted keys: `q` (search
  text), `interests` (comma-separated, lowercased), `sort` (`name`|`child`),
  `dir` (`asc`|`desc`), `age` (`lo-hi`, e.g. `6-12`), and `perRow`. Robustness:
  malformed params fall back to defaults (never throws); age bounds clamped to
  [1,18] and normalized so lower≤upper; only interests that exist on the current
  cards survive (stale/typo'd interests dropped); `perRow` clamped to [1,10].
  `serializeUrlState` OMITS any field at its default, so the no-filter state
  yields an empty query string (canonical clean URL).
- **`lib/directory-url-state.test.ts`** — 16 vitest cases: defaults, search text,
  interest validation/dedup/casing, sort/dir validation, age parse/clamp/
  normalize/malformed, perRow clamp, a "no location leakage" guard, default
  omission on serialize, full-state encode, age-only-when-narrowed, and a
  parse(serialize(x)) round-trip identity.
- **`directory-client.tsx`** — now uses `useRouter`/`usePathname`/
  `useSearchParams`. Filter state (`query`, `selected` interests, `sortKey`,
  `sortDir`, `density`/perRow, `ageLower`/`ageUpper`) is INITIALIZED from the URL
  via a one-time lazy `useState` reading `parseUrlState`. A `validInterestKeys`
  `useMemo` (derived straight from `cards`) feeds the parse so initializers don't
  depend on the later `allInterests` memo. Changes are WRITTEN back with
  `router.replace(..., { scroll: false })` (replace, not push). The search text
  is debounced ~300ms (`SEARCH_URL_DEBOUNCE_MS`) into a `debouncedQuery` used only
  for the URL write; non-text controls write through immediately. A mount guard
  (`didMountUrlSync` ref) skips the first effect run so a shared link isn't
  immediately rewritten, and a `next === searchParams.toString()` early-return
  prevents redundant navigations / loops. Radius/origin state is untouched and
  intentionally excluded from the URL sync.
- **`page.tsx`** — wrapped `<DirectoryClient>` in `<Suspense fallback={null}>`
  because it now calls `useSearchParams()` (Next App Router requires a Suspense
  boundary or the build can bail out of prerendering). The server page's data
  flow is unchanged.

### Verification
- `npm run typecheck` clean.
- `npx eslint` clean on all 4 changed/added files (no exhaustive-deps issues).
- `npm test` → 162 passing (16 new).
- `npm run build` succeeds; `/directory` builds as dynamic (ƒ) with no "Missing
  Suspense boundary with useSearchParams" error. (Only a pre-existing,
  unrelated "inferred workspace root" lockfile warning appears.)

### Potential concerns to address
- `perRow` persists the user's CHOSEN column count, not the viewport-clamped
  `effectiveCols`; on a narrow viewport a shared `perRow=5` still renders clamped
  (existing behavior) but the stored value is preserved — intended.
- `searchParams` is in the sync effect's dep array; each `router.replace` retriggers
  the effect, but the equality guard short-circuits the second pass so there's no
  loop. If a future change adds another writer of the same params, re-check this.
- Browser back/forward currently won't re-seed React state from the URL (state is
  read once at mount). Acceptable for shareable links; revisit only if true
  in-session history navigation over filters is requested.
