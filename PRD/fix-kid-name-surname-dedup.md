# Pixel Parents — Progress Log (branch: `fix/kid-name-surname-dedup`)
*(Most recent updates at top)*

## Progress Update as of June 30, 2026 — 11:00 PM Pacific

### Summary of changes since last update
Polish on the kid-full-name fix: some families typed the surname into the child's
first-name field, so appending the parent surname doubled it (e.g. Daniel Odio's
card read "Devina Odio Odio"). Now we only append the surname when it isn't
already present.

### Detail of changes made:
- **lib/directory.ts** — new exported `childFullName(first, last)`: appends the
  parent surname EXCEPT when the first-name field already contains it
  (case-insensitive). Used by `buildDirectoryCard`'s child projection.
- **components/profile-view.tsx** — per-child heading uses `childFullName`.
- **lib/directory.test.ts** — tests for childFullName (append / no-double / blank).
  60 directory tests pass; tsc + eslint clean.

### Potential concerns to address:
- Heuristic is substring-based; a child genuinely named with a word matching the
  surname is an acceptable edge. Real fix long-term: store child last name, or
  enforce first-name-only at input.
