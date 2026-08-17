# feat/pause-alumni

Second branch of the "Go Pixel Changes V2" round. Ava's direction (Aug 16):
"disable all alum accounts" — remove the signup option AND switch off existing
alumni access, parents/guardians and current students only for now.

## Progress Update as of [August 16, 2026 — 8:25 AM Pacific]

### Summary of changes since last update

First entry. Alumni signup option removed, signed-in alum accounts redirected to
a new public /alumni-paused page (paused-not-deleted framing), alum cards
excluded from the directory, and the landing/directory copy no longer advertises
alumni.

### Detail of changes made:

- **`app/signup/signup-form.tsx`** — the "An OHS alum" radio and its
  welcome-back note are removed (the submit-button copy branch too). The `alum`
  value stays in `lib/options.ts` ACCOUNT_TYPE and the display helpers because
  legacy rows may carry it; only the entry point is gone. `?as=` URL defaulting
  already only maps to "student", so no sanitizing was needed there.
- **`app/(authed)/layout.tsx`** — new `enforceAlumniPause()` beside the existing
  verification gate, same shape (best-effort, NEXT_REDIRECT re-thrown, admins
  exempt) but always-on (no env flag — the signup option is also unconditionally
  gone). Matches the CALLER's own row by email; only an alum's own account is
  paused, not a family that happens to contain an alum row. Redirects to
  /alumni-paused, which lives OUTSIDE (authed) so the redirect cannot loop.
- **`app/alumni-paused/page.tsx`** (new, public) — privacy-page-style shell;
  copy says paused not deleted, and points misclassified people (an alum who is
  also a current parent) at /report.
- **`lib/directory.ts`** — `isDirectoryVisible` now also excludes
  `isAlumAccount` rows. The showcase's Alumni tab hides itself once the bucket
  is empty (it only offers populated buckets), so no client change was needed.
- **`app/page.tsx` + `app/(authed)/directory/page.tsx`** — "parents, students,
  and alumni" copy trimmed to parents and students.

### Verification run

- typecheck / lint / test / build all exit 0, checked per-step
  (1034 tests — no behavioral logic added that isn't UI/gate glue; the gate's
  logic reuses already-tested helpers `isAlumAccount` / `getFamilyForEmail`).

### Potential concerns to address:

- **Whether any real alum rows exist is unknown from here.** The sanitizer has
  been storing "alum" signups as parent-shaped rows (accountType key cleared),
  so the gate may currently protect against zero real rows — it's cheap and
  makes the pause true if any exist (e.g. via admin edits). Someone with DB
  access could check: `SELECT count(*) FROM signups WHERE extra->>'accountType'
  = 'alum'`.
- `enforceAlumniPause` adds one `getFamilyForEmail` lookup per authed page
  render (the verification gate only pays this when its flag is on). If that
  ever shows up in traces, fold the two gates into one shared lookup.
- The Alumni perspective code in `showcase-client.tsx` (type union, counts,
  default mapping) is now dead-but-harmless while the bucket is always empty.
  Left in place deliberately — un-pausing alumni later is then a one-line
  revert in `isDirectoryVisible` plus restoring the radio.
- The OAuth `role` claim doc still says "parent, student, or alumni" — left
  as-is, the data model keeps the role.
