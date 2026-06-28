## Progress Update as of 2026-05-28 10:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Extends the npm enricher with **dependent counts** from deps.dev (Google's Open Source Insights API) so the rubric can reward "other public packages depend on yours" — a load-bearing OSS-impact signal that downloads (inflatable by CI) and stars (measure intent, not usage) can't see.

### Detail of changes made:
- `src/lib/enrichers/npm.ts`:
  - Added `DEPS_DEV` constant pointing at `https://api.deps.dev`.
  - New `fetchDependentCount(pkgName)` helper. Two HTTP calls per package: first to `/v3/systems/NPM/packages/{name}` to get the default version, then to `/v3alpha/.../versions/{ver}:dependents` to get `directDependentCount` + `dependentCount` (total incl. indirect). Returns `null` on failure so the enricher silently degrades.
  - After computing the top package by downloads, calls `fetchDependentCount` for it. Emits a new fact line like *"Top package 'chalk' has 810 direct npm dependents (1.8K total incl. indirect, per deps.dev v5.6.2)."*
  - Raw payload gets `top_package_dependents: { direct, total, version, pkg }`.
- `src/lib/scoring.ts`: adds a new `DIRECT DEPENDENTS tier` row to the NPM SUB-RULES block:
  - 50–499 direct dependents: **+5**
  - 500–4,999: **+15**
  - 5k–49,999: **+30**
  - 50k+: **+50**
- `PRD/scoring-rubric-v0.0.1.md`: documents the new tier and updates the data-sources table.
- `tests/lib/hn-tokenmaxxing-enricher.test.ts`: drive-by type fix — the test's `vi.fn(async (url: string) => ...)` was incompatible with the actual `fetch` signature `(input: URL | RequestInfo)`. Now coerces via `typeof check`. Caught by tsc on this branch, fixed alongside.

### Why dependents > downloads/stars:
- **Stars**: measure intent (someone bookmarked your repo). Even tutorial repos get stars.
- **Downloads**: measure traffic but include CI runs, mirror pulls, automated checks. A package can show millions of monthly downloads while being used by nobody real.
- **Direct dependents**: another public npm package made a deliberate choice to depend on yours. Each one is a hard commitment. chalk's 810 direct dependents IS its real-world impact.

### Potential concerns to address:
- **Public-only**: deps.dev sees only public npm packages. A package widely used inside private companies won't show those. Acceptable tradeoff — public dependents are still the best signal we can get.
- **Extra HTTP hops**: two deps.dev requests per top package, on top of the existing npm registry calls. Could rate-limit on heavy bulk-rescore. Add caching if it becomes a problem.
- **No PyPI/crates yet**: the user's ask was "npm/PyPI/crates dependents." deps.dev supports all three but the enricher infrastructure only exists for npm today. PyPI and crates would each need their own enricher (identity matching, etc.). Punted as separate work — npm is the highest-impact start.
