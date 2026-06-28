## Progress Update as of 2026-05-28 05:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Initial commit on the `founder-matrix` branch. Adds a new "Founder
Matrix" / "Investor Matrix" section to the top of every profile page
(above the Credibility radar). Renders three columns of up to 5 peers
each: Most Like You, Most Complimentary, Least Like You — computed off
the same five-vector radar percentiles already used by the credibility
chart.

### Detail of changes made:
- `src/lib/founder-matrix.ts`:
  - `getMatrixCandidates()` — 5-min in-memory cache. Loads every non-low-
    signal, non-code-source profile with its founder + investor vectors
    pre-percentiled in one pass (mirrors how `buildRadar()` works for a
    single profile in `credibility.ts`).
  - `computeMatrix(myEvalId, myVector, dim, candidates)` — pure math.
    Three columns, each top-5. similar = ascending Euclidean distance.
    complement = descending sum_v (100 − my[v]) × their[v]. opposite =
    descending Euclidean distance. Self excluded. Candidates with all-
    zero vector on the chosen dim excluded so "Most Opposite" isn't
    swamped by "no signal" rows.
- `src/components/FounderMatrix.tsx`:
  - Server component, no client JS. Three-column grid (stacks on mobile)
    inside a rounded card.
  - Each pill: `Avatar` + name + dominant-dim score, links to the
    canonical profile URL with `#founder-matrix` so the destination
    profile scrolls right to its own matrix.
  - Empty-state guards: empty column shows "No matches yet."; whole
    section returns null if all three columns are empty.
- `src/app/(authed)/profile/page.tsx`:
  - Computes `matrixDim` (founder vs investor based on which dominant
    score is higher).
  - Builds `myMatrixVector` from the already-fetched radar percentiles
    (no extra DB work for the current profile).
  - Calls `computeMatrix()` with `getMatrixCandidates()` only when the
    current profile has at least one non-zero vector on the dominant
    dim.
  - Renders `<FounderMatrix>` immediately above the existing Credibility
    section.
- `tests/lib/founder-matrix.test.ts`:
  - 9 pure-function tests covering ordering for all three columns,
    self-exclusion, all-zero exclusion, dimension switching, top-5 cap,
    "fewer than 5" handling, and displayScore selection.

### Potential concerns to address:
- `computeMatrix()` allows the same person to appear in multiple columns
  (e.g. someone "Most Like You" could also have high complement score
  if their dimensions happen to match). We didn't de-duplicate; the
  three column meanings convey different things even when the person
  overlaps. Easy to add if it looks bad in practice.
- Euclidean distance for "Least Like You" can surface people who are
  simply weaker across the board rather than truly shape-inverted. If
  the user wants stricter "opposite shape" semantics, swap to
  1 − cosine_similarity which is magnitude-invariant.
- The matrix is computed on every profile-page render. The candidate
  cache is shared across requests (5-min TTL), so the heavy DB query
  amortizes. The per-render computation itself is O(N × 5) for N
  candidates and runs in well under a millisecond at current
  population sizes.
