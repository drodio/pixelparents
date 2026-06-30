# perf/w1-directory-coldstart — progress log

## Progress Update as of [June 30, 2026 — 6:06 AM Pacific]

### Summary of changes since last update
First entry. Made the Directory page (`app/(authed)/directory/page.tsx`) fast on a
cold serverless start WITHOUT changing its UX or breaking client-side
filtering/sorting/search. Three server-cost wins: (1) push the cheap, index-friendly
visibility preconditions into SQL so the DB returns a fraction of the rows; (2)
presign only above-the-fold HERO photos eagerly and defer thumbnail presigns to a
streamed Suspense child; (3) cache the slow-changing stats/map aggregates in Next's
data cache. `tsc`, `eslint`, and `vitest` (342 tests) all pass; production `next
build` verified in the main checkout (worktree build fails only on the symlinked
node_modules, per repo convention).

### Detail of changes made:
- **SQL row-narrowing (`lib/db/signups.ts`):** added `getDirectorySignups()`. The
  page previously did `db.select().from(signups).orderBy(desc(createdAt))` —
  i.e. SELECT every signup row, then filter visibility in JS. The new query pushes
  the cheap preconditions into the WHERE clause:
  `(share_enabled = true AND share_token IS NOT NULL AND btrim(first_name) <> '')
  OR extra->>'accountType' = 'student'`.
  - The first branch is the index-friendly subset of `isDirectoryVisible`'s gate.
  - The `OR student` branch keeps EVERY student account regardless of its own
    sharing, because the page's `studentsByFamily` map enriches a visible PARENT's
    card (a child resolved to its linked student account). Students are few, so
    this keeps that map complete without a second round-trip while still dropping
    the bulk of non-sharing parent rows.
  - The authoritative `isDirectoryVisible(row)` JS gate STILL runs over the result,
    so semantics are byte-for-byte identical — it just receives far fewer rows.
- **Supporting index (`lib/db/ensure.ts`):** added `ensureDirectoryIndex()` — an
  idempotent `CREATE INDEX IF NOT EXISTS signups_directory_idx ON signups
  (created_at DESC) WHERE share_enabled = true AND share_token IS NOT NULL`. PARTIAL
  index over exactly the directory predicate, so it's tiny (only shared profiles)
  and serves the ordered scan straight from the index. `getDirectorySignups()`
  calls it (alongside `ensureFamiliesSchema()`) on the read path, mirroring the
  other self-healing guards. Reset-on-failure so a transient DDL race retries.
- **Photo presigning split (`app/(authed)/directory/page.tsx`):** was up to
  `1 hero + MAX_THUMBS(4) = 5` presigns PER visible card on every render. Now:
  - HEROES are presigned eagerly (one per card) → first paint shows hero + all card
    data (names, tags, links); the grid is fully interactive immediately.
  - THUMBNAILS are presigned in a deferred Promise rendered through a module-scoped
    `ThumbnailedShowcase` async component behind `<Suspense>`, with the hero-only
    `ShowcaseClient` as the fallback. Thumbnails stream in a beat later. Until then
    a card shows just its hero (`thumbUrls = []`), exactly like an already-photoless
    card — no shown photo is dropped, and the FINAL rendered state is identical to
    before. When a card set has no thumbnails, it skips the deferral entirely.
  - `buildCards(urlByPath)` and `presignToMap(paths)` helpers keep card projection
    + presign logic single-sourced across the eager and deferred passes.
- **Cached aggregates (`app/(authed)/directory/page.tsx`):** wrapped the unfiltered
  `getStats()` / `getBreakdowns()` in `unstable_cache` (`getCachedStats` /
  `getCachedBreakdowns`, `revalidate: 60s`, tag `directory-aggregates`). These feed
  the map markers + condensed stats strip, which change only when a family
  joins/updates. Cached at the page call site ONLY — the filtered API callers
  (`/api/v1/stats`, `/api/v1/breakdowns`, MCP) keep calling the raw functions and
  are unaffected. Used `unstable_cache` (not `use cache`) because `use cache`
  requires enabling `cacheComponents` globally in `next.config.ts`, which is out of
  this wave's file scope and more invasive.

### Validation:
- `npx tsc --noEmit` — clean.
- `npx eslint` on all touched files — clean (had to hoist `ThumbnailedShowcase` to
  module scope to satisfy `react-hooks/static-components`).
- `npx vitest run` — 30 files, 342 tests pass.
- `npm run build` — FAILS in the worktree on the symlinked `node_modules` (Turbopack
  "Symlink points out of filesystem root"), per repo convention. Verified by copying
  the changed files into the main checkout `/Users/main/stanfordohs/pixelparents`,
  building there (`/directory` compiled as a dynamic route, build succeeded), then
  `git checkout --` to restore main clean.

### Potential concerns to address:
- **Streaming remount of `ShowcaseClient`:** when the deferred thumbnail render
  resolves, React swaps the Suspense fallback (hero-only `ShowcaseClient`) for the
  thumbnail-complete one — a remount. All SHAREABLE filter state (search, interests,
  sort, age, per-row) is URL-persisted, so it's reproduced from the URL on the new
  mount; the swap window is sub-second (heroes are already presigned, only
  thumbnails remain). The only transient losses are in-flight search text inside the
  300ms debounce that hasn't hit the URL yet, and "Near me" (deliberately never
  URL-persisted). Acceptable for a one-time streaming beat, but if it ever feels
  janky, the alternative is to presign thumbnails eagerly too (reverting just win #2)
  or to push thumbnail URLs into the client without remounting.
- **`signedPhotoUrls` double token-issue:** the eager hero pass and the deferred
  thumb pass each call `signedPhotoUrls`, which issues one Vercel Blob delegation
  token per call — so two token issues instead of one. The per-path `presignUrl`
  work (the bulk) is unchanged in total; this is a small, deliberate trade for not
  blocking first paint on thumbnails.
- **Aggregate staleness:** stats/map can be up to 60s stale on the directory. These
  are headline counts ("N families"), not correctness-critical; tune `revalidate`
  or add a `revalidateTag("directory-aggregates")` on signup writes if fresher
  numbers are wanted.
- **Index creation on cold start:** `CREATE INDEX IF NOT EXISTS` is cheap when the
  index already exists, but the very first run on a large table builds it (not
  CONCURRENTLY, so it briefly locks writes). One-time; consider pre-creating it via
  a real migration to avoid the first-request cost in prod.
