# Bulk-Scoring Enrichment + Multi-Email / Subject-Location Model — Design Spec

- **Date:** 2026-06-01
- **Branch:** `bulk-scoring-enrichment` (based on `main` @ `6e66470`)
- **Status:** Design approved in conversation; pending written-spec review.

## Motivation

The bulk-scoring page (`/admin/profiles/new`) ingests pasted rows / uploaded CSVs
and scores **new** profiles, but it **silently skips** any row that matches a
profile already in the system, and it captures **only name / company / LinkedIn
URL** — discarding any email or location present in the input.

The operator (DROdio) wants to **capture as much existing user information as
possible** from pasted rows and CSVs, and get back an **enriched superset**:

1. Stop ignoring existing profiles — **enrich** them with new data from the row
   (emails, location) instead of dropping them.
2. **Extract email addresses** from pasted/CSV rows and attach them — operator-
   provided emails get status **verified**.
3. **Extract location** (city/state/country) and attach it, mapping onto the
   existing LinkedIn-derived and claimer-set location infrastructure.
4. Return **all** input rows back as scored/enriched profiles, downloadable as a
   CSV that is a **superset** of what was uploaded (everything we know).

## Current state (as built today)

- **Parsing:** `src/lib/parse-paste-input.ts` (URL or `name[,company]`) and
  `src/lib/csv-to-lines.ts` (header-mapped `name`/`company`/`url`). **No email,
  no location.**
- **Dedup:** `POST /api/admin/jobs` skips matches — URL rows on
  `evaluations.linkedin_url`, name rows on `lower(full_name)` — dropping them
  with `skippedDedupe`; returns `400 "all items already scored"` if all dupes.
- **Job items** (`scoring_job_items`): `inputRaw / inputName / inputCompany /
  linkedinUrl / evaluationId / status / scores / cost`. No email/location.
- **Worker:** `src/app/api/cron/scoring-tick/route.ts` resolves a URL then calls
  `runEval(url)` (new) or `reEvaluate(evalId)` (rerun). `runEval` takes **only a
  URL** — no email/location hints.
- **Email (post-#148, async):** single `evaluations.found_email` +
  `found_email_status` columns (values `valid` / `not_found` / null). The
  `find-email` button enqueues eligible rows (`find_email_queued_at/by/billable`);
  `src/app/api/cron/find-email-tick/route.ts` drains the queue, calls
  AnyMailFinder (`src/lib/anymailfinder.ts`), and on a `valid` hit writes
  `found_email` + charges $0.05 (`src/lib/find-email-logic.ts`). Display label is
  *derived* in `src/lib/admin-profiles-view.ts` `profileEmailInfo()`: claimed →
  `verified` (claimer Clerk email), unclaimed + `found_email` → `unverified`.
  **There is no per-email status and no multi-email support.**
- **Location:** `requestCity/Region/Country` = scorer IP (bulk leaves null).
  `users.city/region/country` = claimer self-set (claimed-only, `/account`).
  LinkedIn location *is* captured by the NFX enricher
  (`src/lib/enrichers/nfx.ts`, `location.display_name`) but only as free text
  inside the `evaluations.profile.enrichments[]` blob — **not structured, not
  surfaced.** No unified subject location.
- **CSV export:** client-side in `src/components/admin/ProfilesScoredTable.tsx`
  (`toCsv` + `exportCsv` → `profiles-scored-<date>.csv`), single `Email` /
  `Email Status` columns, `Location` = scorer IP.

---

## Design

### Part 1 — Unified multi-email model (`profile_emails`)

**Decision: Approach A (unify).** A profile can have many emails; each carries
its own status and provenance, so an AnyMailFinder "unverified" email and an
operator-provided "verified" email coexist.

**New table `profile_emails`:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `evaluation_id` | uuid FK → evaluations(id) `on delete cascade` | |
| `email` | text not null | stored lowercased/trimmed |
| `status` | text not null | `verified` \| `unverified` |
| `source` | text not null | `operator` \| `anymailfinder` \| `linkedin` |
| `added_at` | timestamptz default now | |
| `added_by` | text null | Clerk id of the admin (operator source); null for automated sources |

- **Unique index** on `(evaluation_id, lower(email))` — one row per email per
  profile; re-adding the same email is an upsert (may *upgrade* status, see
  precedence).
- Index on `evaluation_id` for the per-profile read.

**Status precedence (an upsert never downgrades):** `verified` > `unverified`.
An operator-provided `verified` email upgrades an existing `unverified` row for
the same address; an `anymailfinder` write never downgrades an existing
`verified` row.

**AnyMailFinder integration (redirect the #148 cron's result):**
- `find-email-tick` cron: on a `valid` hit, **insert/upsert a `profile_emails`
  row** (`source='anymailfinder'`, `status='unverified'`, `email=outcome.email`)
  instead of writing `evaluations.found_email`. Charging ($0.05) and the queue
  mechanics (`find_email_queued_*`) are **unchanged**.
- **Eligibility + no-re-queue stays column-based but on a dedicated tracker.**
  Keep `found_email_status` purely as the *attempt tracker*: `null` = never
  attempted, `not_found` = attempted miss. The cron still sets
  `found_email_status='not_found'` on a miss. On a hit it sets
  `found_email_status='valid'` **and** inserts the `profile_emails` row (the
  column flips the row out of the eligible set; the email lives in the table).
  `find-email/route.ts` eligibility (`isNull(found_email)` →
  `isNull(found_email_status)` only, since the email no longer lives in the
  column) is updated to gate on `found_email_status IS NULL`.
- `evaluations.found_email` column is **retained but deprecated** (no longer the
  read source) to minimize churn against the other agent's surface; a follow-up
  can drop it once their find-email work stabilizes.

**Migration / backfill:** for every `evaluations` row with `found_email` not
null, insert a `profile_emails` row (`source='anymailfinder'`,
`status='unverified'`, `added_at=found_email_at`, `added_by=found_email_by`).
Idempotent via the unique index.

**Operator/CSV emails:** written to `profile_emails` with `source='operator'`,
`status='verified'`, `added_by=<acting admin Clerk id>`.

**Display read model:** `profileEmailInfo()` (and the admin row builders) read
`profile_emails` for the profile. Claimer Clerk emails remain `verified` and are
*merged in* as virtual `verified` rows at read time (they are not persisted to
`profile_emails` — they live in Clerk). Ordering for display/CSV: **verified
first, then unverified**, tie-broken by `added_at` desc.

### Part 2 — Unified subject location

**New columns on `evaluations`:** `subject_city`, `subject_region`,
`subject_country` (text, nullable), `subject_location_raw` (text — the original
free-text we couldn't confidently structure), `subject_location_source` (text:
`claimer` \| `operator` \| `linkedin`).

**Precedence (higher never overwritten by lower):**
1. `claimer` — the claimer's self-set `users.city/region/country`.
2. `operator` — operator/CSV-provided.
3. `linkedin` — NFX `location.display_name`, parsed best-effort.

**Population:**
- **Operator/CSV:** structured city/state/country from the input row → write
  `subject_*` with `source='operator'` (overwrites a `linkedin` value; never
  overwrites a `claimer` value).
- **LinkedIn:** during scoring, parse the NFX `display_name` (best-effort
  city/region/country; keep the raw string in `subject_location_raw` always) →
  write with `source='linkedin'` only if no higher-precedence value exists.
- **Claimer:** `POST /api/account/location` continues to write
  `users.city/region/country` (unchanged) **and** mirrors into the eval's
  `subject_*` with `source='claimer'` so the canonical field reflects the most
  authoritative value. (Claimer remains editable on `/account`; the mirror keeps
  the queryable column in sync.)

**Reads:** admin list/CSV/profile display read the canonical `subject_*`. This is
the data a future **Geography leaderboard facet** would filter on.

### Part 3 — Ingestion (extract email + location)

Extend the two parsers; carry the extracted fields on the job item.

- **`parse-paste-input.ts`:** add email detection (RFC-lite regex) on each line;
  a line may now yield `{ ...nameCompany|url, email?, city?, region?, country? }`.
  Free-text location remains best-effort (often absent in pastes).
- **`csv-to-lines.ts`:** add recognized header tokens — `email`/`work email`/
  `e-mail` → email; `city`; `state`/`region`/`province` → region;
  `country`; `location` → free-text → best-effort split. Map per data row.
- **`scoring_job_items` new columns:** `input_email`, `input_city`,
  `input_region`, `input_country`, `input_location_raw` (all text, nullable) so
  the enrichment data rides with the item through the async pipeline.

### Part 4 — Enrich-existing behavior (`POST /api/admin/jobs`)

Stop silently skipping matches. For each parsed input row:
- **Match** an existing profile (linkedin_url for URL rows; `lower(full_name)`
  for name rows — unchanged keys).
- **Existing match** → enriched **synchronously in the job-submit request** (pure
  DB writes — no LLM, no credit charge): the job item is created with
  `evaluationId` set, enrichment applied via `applyRowEnrichment`, and the item
  marked terminal `enriched` with its score snapshot copied from the existing
  eval. No scoring-tick pass is needed, so existing rows are "done" within
  seconds of submit.
- **New profile** → job item as today (`evaluationId` null, `status='pending'`).
  The scoring-tick cron scores it via `runEval`, **then** calls
  `applyRowEnrichment` on the freshly-created eval using the item's stored
  `input_email`/`input_*` columns.
- The `400 "all items already scored"` short-circuit is **removed** — an
  all-existing upload is now a valid enrich-only job (every item lands `enriched`
  synchronously).
- `skippedDedupe` is retained only for genuinely unusable rows (invalid/empty),
  not for "already exists".

**Enrichment application (shared helper `applyRowEnrichment(evalId, row, byAdmin)`):**
- Email: if `input_email` present → upsert `profile_emails`
  (`source='operator'`, `status='verified'`).
- Location: if structured city/region/country present → write `subject_*`
  (`source='operator'`, honoring precedence). Else if `input_location_raw`
  present → best-effort structure; keep raw.
- Called **synchronously at job-submit** for existing matches, and **after
  scoring (in the cron)** for new profiles.

### Part 5 — Output / enriched CSV

Reuse the job-results **Export CSV** (`ProfilesScoredTable`), widened:
- Replace single `Email` / `Email Status` with **dynamic pairs**: `Email 1`,
  `Email 1 Status`, `Email 2`, `Email 2 Status`, … up to the max email count in
  the result set; rows with fewer leave trailing pairs blank. Order: verified
  first, then unverified.
- Replace the scorer-IP `Location` column with subject **City / State / Country**
  (from `subject_*`). (Keep the scorer-IP column too if still useful, renamed for
  clarity, e.g. `Scored-From IP Location`.)
- Existing matches are exportable within seconds (enriched immediately); new
  profiles fill in as the scoring cron completes them. The job page already lists
  all rows; "Export CSV" gives the full superset once settled.

The row shape feeding the table (`src/lib/profiles-scored.ts` `ScoredProfileRow`
and the job view) gains: `emails: { email, status, source }[]` and
`subjectCity/Region/Country`.

---

## Coordination & sequencing (IMPORTANT)

The email surface (`found_email*`, `find-email-tick`, `find-email/route`,
`ProfilesScoredTable` email cells) is the **other agent's actively-evolving
work** (#145, #147, #148 in rapid succession). Approach A refactors the
**result-write** and **display** of that surface.

- **Sequence the email refactor after their find-email work stabilizes**, or
  coordinate the cron-writer handoff directly. The queue mechanics and charging
  are left untouched to shrink the blast radius; only the *result home* and the
  *read model* move.
- The **location** and **ingestion/enrich-existing** parts are independent of the
  email surface and can land first without coordination.
- Recommended build order: **(1) subject-location model + ingestion + enrich-
  existing (location)** → **(2) `profile_emails` table + migration + operator-
  email writes + widened CSV** → **(3) redirect the AnyMailFinder cron + display
  to `profile_emails`** (the coordinated step).

## Consequences & concerns

- **Refactoring a live surface mid-flight** (email) risks merge conflicts with
  the other agent — mitigated by sequencing and keeping queue/charging intact.
- **`found_email` column deprecated, not dropped** initially — transient
  duplication (column + table row) until a cleanup follow-up.
- **Free-text location parsing is lossy** ("San Francisco Bay Area" has no clean
  city/region/country). We always retain the raw string and only promote
  confident parses; unconfident ones stay raw.
- **Claimer-location mirror** adds a small write to `/api/account/location`;
  precedence ensures operator/LinkedIn never clobber a claimer value.
- **Enrich-only is free** (no LLM/credits); a separate re-score remains the
  existing manual action.

## Out of scope (future work)

- Geography leaderboard facet (this spec only produces the data).
- Dropping the deprecated `found_email` column (cleanup follow-up once email
  fully reads from `profile_emails`).
- Surfacing `extractedMetrics.publicEmail` (LLM-extracted) as a `linkedin`/`llm`
  source row in `profile_emails` — possible later, not now.
- Email-based dedup/matching (matching stays on linkedin_url / name).
- Re-scoring existing matches during enrichment (explicitly excluded;
  enrich-only).

## Open questions / assumptions

- Migration numbering: next free is `0030+` (latest on main is `0029`). Exact
  numbers fixed at plan time.
- Assumes the operator CSV's structured columns (`city`/`state`/`country`) are
  trustworthy enough to outrank LinkedIn — confirmed by the precedence decision.
- Assumes claimer Clerk emails stay virtual (read from Clerk, merged at display)
  rather than persisted into `profile_emails`.
