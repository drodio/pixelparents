## Progress Update as of June 29, 2026 — 8:44 PM Pacific

### Summary of changes since last update
First entry for this branch. Adds a live count of OHS **students** building
Pixel Parents to the home-page footer, plus a "Become a student builder" link.
Focused change — one new DB count helper, a footer copy/markup update, and a
small unit test. No migration (the data already lives in existing columns).

### Detail of changes made:
- `lib/db/signups.ts`: new `getStudentBuilderCount()` mirroring
  `getBuilderCounts()` — raw `getSql()` query with an explicit `count(*)::int`
  column (no `SELECT *`, so no `ensureFamiliesSchema()` needed). Counts signups
  that are BOTH a student affiliation AND a builder:
  `ohs_affiliation = ANY($STUDENT_AFFILIATIONS) AND extra->>'builderInterest' = 'builder'`.
  `STUDENT_AFFILIATIONS` is a module-level const sliced from
  `OHS_AFFILIATIONS[3]` ("Current OHS student…") and `[4]` ("Alumni student…")
  imported from `lib/options.ts`, so the exact strings stay in lockstep with the
  signup form. NOTE: the raw query uses the real DB column name `ohs_affiliation`
  (snake_case) — the Drizzle field is `ohsAffiliation` but the column is
  `text("ohs_affiliation")`; `extra` maps 1:1 to column `extra`.
- `app/page.tsx`: imports `getStudentBuilderCount`, adds it to the existing
  `Promise.all` (and the catch-block reset defaults `studentBuilders = 0`).
  Footer line now reads "Created with [IconHeart] by N technical parent(s),
  M non-technical parent(s) learning to become builders, and S students building
  Pixel Parents." The students clause is omitted entirely when S === 0 (cleaner
  than "0 students"). Singular/plural handled for all three counts. Added a
  "Become a student builder" link → `/builders#student-builders`, styled exactly
  like the existing amber "Learn more about us" link, which is kept. The
  "Become a student builder" link always renders, even at S === 0.
- `lib/db/signups.test.ts`: new test file (matches repo convention — unit tests
  cover pure logic, no live DB). Verifies (1) `getStudentBuilderCount()` rejects
  with a /DATABASE_URL/ error when no DB is configured (proving it is wired to
  the DB path and degrades via the page's try/catch), and (2) `OHS_AFFILIATIONS`
  indices 3 and 4 are the exact student-affiliation strings the count filters on.

### Validation:
- `npm run typecheck` — passes clean.
- `npx eslint lib/db/signups.ts lib/db/signups.test.ts app/page.tsx` — clean.
- `npm test` — 17 files, 170 tests pass (incl. 2 new).

### Potential concerns to address:
- The link target `/builders#student-builders` is an anchor into the existing
  `/builders` page (rendered from `builders.md`). `builders.md` has a "How we
  work with OHS students" section but no explicit `id="student-builders"` anchor,
  so the deep-link currently lands at the top of the page. Adding that anchor to
  `builders.md` (or the markdown renderer's heading slugs) is a tidy follow-up,
  out of scope for this footer change.
- `getStudentBuilderCount()` filters on `extra->>'builderInterest' = 'builder'`
  only (technical builders), matching the spec ("AND a builder"). Aspiring
  students are intentionally not counted.
