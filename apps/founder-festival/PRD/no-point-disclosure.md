## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Enforce the hard rule that user-facing reason/bullet text never discloses how many points an item is worth. Fixed the LinkedIn follower-reach reason (was "(1 point per 1,000 followers)") and added a `.husky/pre-commit` guard that blocks any staged reason/bullet string revealing point values, so it can't be reintroduced.

### Detail of changes made:
- `src/lib/eval-pipeline.ts`: follower-reach reason now reads "<N> LinkedIn followers — broad professional reach." (no formula). Points unchanged (still floor(followers/1000)).
- `.husky/pre-commit`: new "point-disclosure guard" — scans ADDED lines in staged .ts/.tsx (skips pure comments, scoring-rubric.ts prompt, tests) for `point(s) per`, sign-before values (+N points / -N pts), and "N points for/per". Tuned so HN "50+ points" (upvotes, sign after) and Tailwind "pt-3" don't false-positive. Verified against both violation and legit cases.
- `PRD/scoring-rubric-v0.0.1.md`: changelog note (no scoring change; reason wording + guard only).

### Potential concerns to address:
- The guard is heuristic (regex on added lines). It catches the common disclosure shapes but not every conceivable phrasing (e.g. spelled-out "twenty-seven points"). It's a guardrail, not a proof.
