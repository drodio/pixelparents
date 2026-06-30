# Pixel Parents — Progress Log (branch: `fix/directory-kid-names`)
*(Most recent updates at top)*

## Progress Update as of June 30, 2026 — 10:52 PM Pacific

### Summary of changes since last update
Fixes the directory/showcase duplication where a student appeared BOTH as their
own card AND as a child on their parent's card. New model: kids/students are NEVER
standalone directory cards — they show only as a (full) name on their linked
parent's card.

### Detail of changes made:
- **lib/directory.ts** — `isDirectoryVisible` now excludes student accounts
  (`!isStudentAccount(row)`), so a student never gets a standalone card. Child
  projections in `buildDirectoryCard` gain a full `name` = child first name + the
  card owner's (parent's) surname (e.g. "Ansh Vasani", not "Ansh"). `DirectoryCard.children`
  type updated with `name`.
- **app/(authed)/community/showcase-client.tsx** — renders + searches the full kid
  `name` instead of just `firstName`.
- **components/profile-view.tsx** — the per-child section heading shows the full
  name (`first + parent surname`).
- **lib/directory.test.ts** — updated the children expectation + added a
  student-exclusion test. 219 tests pass; build clean.

### Potential concerns to address:
- FOLLOW-UP (not in this PR): enforce at SIGNUP that a student account must add a
  linked parent (mirror of a parent adding a student), so every kid is always
  represented under a parent. Today the dedup relies on the family link existing.
- A student with no linked parent + their own shareToken would simply not appear
  in the directory now (no standalone card) — which is the desired privacy posture.
