# Branch: `bulk-scoring-enrichment` — progress log

## Progress Update as of 2026-06-01 (plans written)
*(Most recent updates at top)*

### Summary
Wrote 3 dependency-ordered implementation plans under `docs/superpowers/plans/`:
A (data model: profile_emails table, subject-location columns, job-item input
columns, pure helpers + backfill script), B (ingestion: parser email/location
extraction, structured CSV rows, enrich-existing jobs route, applyRowEnrichment,
scoring-tick post-score enrichment), C (output: row shape + display reading
profile_emails, widened Email N CSV, AnyMailFinder cron/display redirect —
COORDINATED). Executing autonomously; building + PR only, NOT merging to prod or
applying migrations while the user is away.

### Execution progress
- **A1–A3 (done):** `profile_emails` table + `subject_*` columns + job-item
  `input_*` columns in `schema.ts`; migration regenerated as
  `0030_lumpy_glorian.sql` (NOT applied). `profile_emails` unique index is plain
  `(evaluation_id, email)` — emails are always normalized lowercase, so it's
  equivalent to `lower(email)` and lets `onConflictDoUpdate` target it by columns.
- **A4–A6 (done):** `src/lib/subject-location.ts` (parse + precedence write,
  claimer>operator>linkedin) and `src/lib/profile-emails.ts` (normalize/isEmail/
  order + precedence upsert that never downgrades verified). Backfill
  `scripts/backfill-profile-emails.ts` (`npm run backfill-profile-emails`, run
  manually with a real DATABASE_URL — copies `found_email`→`profile_emails`,
  source anymailfinder/unverified; sets `found_email_status` on legacy hits).
  16 pure-function tests pass; tsc clean.
- **B1/B2/B4 (done):** `parse-paste-input.ts` extracts inline email (only attaches
  `email` when present, so existing strict-equality tests pass); `parseCsvRows`
  in `csv-to-lines.ts` returns structured rows preserving email + city/state/
  country/locationRaw (kept DB-free for the client bundle); `src/lib/row-enrichment.ts`
  `applyRowEnrichment` (email→verified operator profile_emails; location→subject_*
  via precedence) + pure `toSubjectLocation`. +43 tests pass; tsc clean.
- **B5/B6 (done):** `POST /api/admin/jobs` now accepts `rows: CsvRow[]`, partitions
  items into existing `matches` (enriched in place at submit, status `enriched`,
  score snapshot copied, FREE) vs `fresh` (scored as before, credit-held); the
  "all already scored" 400 is gone; all-enriched jobs are marked `completed` at
  submit. `scoring-tick` applies `applyRowEnrichment` to fresh items post-score
  and counts `enriched` as terminal/done in the completion tally. tsc + eslint
  clean. (Route tests deferred — DB-bound; logic is straight-line over the tested
  helpers.)
- **B3 (done):** `NewJobForm` holds CSV as structured `parseCsvRows` rows (not
  collapsed into the textarea) and submits `rows: CsvRow[]`; estimate includes
  CSV rows; success alert reports `scored` vs `enrichedExisting`. tsc + eslint
  clean. **Plan B complete.** 55 enrichment tests pass.
- **C1–C3 (done):** `ScoredProfileRow` gains `emails[]` (batch-loaded from
  `profile_emails`, verified-first) + `subjectCity/Region/Country`;
  `profileEmailInfo` now merges claimer Clerk emails + `profile_emails` (verified
  first, de-duped, returns a `list`); `fmtSubjectLocation` added; the job-results
  **Export CSV** widened to dynamic `Email N`/`Email N Status` pairs + Subject
  City/State/Country (scorer-IP column renamed "Scored-From Location"). 62 tests
  pass; tsc + eslint clean. (toCsv unit test deferred — it's a `"use client"`
  local fn; the ordering it relies on is covered by profile-emails/admin tests.)
- **C4 (done, COORDINATED):** `find-email-tick` cron also upserts a `profile_emails`
  row (anymailfinder/unverified) on a valid hit. `found_email*` retained for the
  cron's own dedup/audit → eligibility unchanged, **C5 unnecessary**. Only task
  touching the other agent's live find-email surface — coordinate before merge.
  **Plan C complete.** tsc + eslint clean.

## Progress Update as of 2026-06-01 (design)
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed (via the superpowers brainstorming skill) a design for enriching the
bulk-scoring page (`/admin/profiles/new`): stop ignoring existing profiles,
extract emails + location from pasted rows / CSVs, unify emails into a multi-email
model, add a canonical subject-location, and return an enriched superset CSV.
Wrote the spec to `docs/superpowers/specs/2026-06-01-bulk-scoring-enrichment-design.md`.
No code yet — design pending user review of the written spec, then an
implementation plan.

### Detail of changes made (design decisions):
- **Existing profiles:** enrich-only (no LLM re-score, no charge); enriched
  synchronously at job-submit, item → terminal `enriched` status.
- **Email model:** Approach A (unify) — new `profile_emails` table
  (`email, status verified|unverified, source operator|anymailfinder|linkedin,
  added_at, added_by`), unique on `(eval_id, lower(email))`. Operator/CSV emails =
  `verified`. Migrate existing `found_email` → table; redirect the #148
  `find-email-tick` cron's hit-write into the table (keep queue + charging
  intact); deprecate (don't drop) the `found_email` column.
- **Location model:** first-class `subject_city/region/country` (+ raw + source)
  on `evaluations`; precedence claimer > operator > linkedin; parse the NFX
  `display_name` we already capture; mirror claimer `/account` location into the
  canonical column. Sets up a future Geography leaderboard facet.
- **Ingestion:** extend `parse-paste-input.ts` + `csv-to-lines.ts` to extract
  email + location; carry on new `scoring_job_items` `input_email/input_*` columns.
- **Output:** widen the existing job-results Export CSV — dynamic `Email N` /
  `Email N Status` pairs (verified first) + subject City/State/Country.

### Potential concerns to address:
- **Coordination:** the email surface (`found_email*`, `find-email-tick`,
  display) is the OTHER agent's actively-evolving work (#145/#147/#148). Approach
  A refactors its result-write + read model. Build order: (1) location +
  ingestion + enrich-existing, (2) `profile_emails` + operator emails + CSV,
  (3) redirect AnyMailFinder cron + display (the coordinated step). Sequence (3)
  after their find-email work settles.
- Free-text location parsing is lossy — always retain the raw string; only
  promote confident parses.
- `found_email` column deprecated, not dropped (cleanup follow-up).
- Migration numbering: next free is 0030+ (latest on main is 0029).
