# Enrichment Plan C — Output, Display & AnyMailFinder Redirect

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Surface the multi-email + subject-location data (admin table + enriched CSV) and unify the AnyMailFinder result into `profile_emails`.

**Architecture:** The scored-profile row shape gains `emails[]` + subject location; the admin display + CSV read from `profile_emails`; the widened CSV emits dynamic `Email N`/`Email N Status` pairs. The #148 `find-email-tick` cron writes its hit into `profile_emails` (the coordinated step).

**Depends on:** Plans A + B. **Coordination:** Tasks C4–C5 touch the other agent's live find-email surface — sequence after their work settles; this plan's PR is held for coordinated merge.

Spec: `docs/superpowers/specs/2026-06-01-bulk-scoring-enrichment-design.md`.

---

### Task C1: Row shape — add emails[] + subject location

**Files:** Modify `src/lib/profiles-scored.ts` (`ScoredProfileRow`, `EVAL_BASE_COLUMNS`, `listScoredProfiles`/`listProfilesForJob`).

- [ ] Add to `ScoredProfileRow`: `emails: { email: string; status: "verified" | "unverified"; source: string }[]` and `subjectCity/Region/Country: string | null`.
- [ ] Select `subject_*` in `EVAL_BASE_COLUMNS`. Batch-load `profile_emails` for the page's eval ids (one `inArray` query, group by evaluationId — same pattern as the badge-overrides batch in `leaderboard.ts`) and attach `emails` per row. Keep claimer Clerk emails as virtual `verified` entries merged in (reuse `resolveEmails`).
- [ ] Order each row's `emails` via `orderEmailsForDisplay`.
- [ ] Test: grouping/attachment logic via a pure helper if extracted; else manual.
- [ ] Commit.

### Task C2: Display read model — `profileEmailInfo` reads `profile_emails`

**Files:** Modify `src/lib/admin-profiles-view.ts`.

- [ ] Change `profileEmailInfo` (and `EmailStatus` usage) to take the row's `emails[]` (+ claimed flag) and return the primary email + a per-email list. Claimed → claimer verified emails first; then `profile_emails` rows. Keep `EmailStatus = "verified" | "unverified"` for the primary cell.
- [ ] Update callers in `admin-profiles-rows.ts` to pass `emails`.
- [ ] Test: claimed → verified primary; unclaimed with anymailfinder-only → unverified; unclaimed with operator email → verified primary.
- [ ] Commit.

### Task C3: Widen the CSV + admin table columns

**Files:** Modify `src/components/admin/ProfilesScoredTable.tsx` (`toCsv`, headers, the Email + Location cells, `ProfileTableRow`).

- [ ] `ProfileTableRow` gains `emails[]` + `subjectCity/Region/Country`.
- [ ] `toCsv`: compute `maxEmails = max(row.emails.length)` across rows; emit headers `Email 1, Email 1 Status, …, Email N, Email N Status` (replacing the single `Email`/`Email Status`). Per row, fill pairs in `orderEmailsForDisplay` order; blank for missing. Replace the scorer-IP `Location` column value with subject `City`, `State`, `Country` columns; rename the IP-geo column to `Scored-From Location` (keep `IP`).
- [ ] Table UI: the Email cell shows the primary email + a small "+N" when multiple; the Location cell shows subject city/region/country.
- [ ] Test: `toCsv` with rows of 0/1/3 emails → correct dynamic headers + aligned cells (extract `toCsv` is already pure-ish; unit-test it).
- [ ] Commit.

### Task C4 (COORDINATED): redirect `find-email-tick` hit → `profile_emails`

**Files:** Modify `src/app/api/cron/find-email-tick/route.ts`.

- [ ] On a `valid` hit, replace the `found_email`/`found_email_status='valid'` write with: set `found_email_status='valid'` (keep as attempt-tracker so the row leaves the eligible set) AND `await upsertProfileEmail(e.id, outcome.email, "unverified", "anymailfinder", e.queuedBy)`. Keep `found_email_at/by` writes (harmless audit) or drop — leave them for now.
- [ ] Miss path (`found_email_status='not_found'`) unchanged.
- [ ] Test: match the cron's existing test style; assert a hit inserts a `profile_emails` row (mock `upsertProfileEmail`).
- [ ] Commit.

### Task C5 (COORDINATED): eligibility gate update

**Files:** Modify `src/app/api/admin/profiles/find-email/route.ts`.

- [ ] Eligibility currently gates on `isNull(found_email) AND isNull(found_email_status)`. Since the email no longer lives in `found_email` for new writes, gate on `isNull(found_email_status)` only (null = never attempted). Leave `found_email` references for the migrated/legacy rows (the backfill set the table, but found_email may still be non-null on old rows — keep the `isNull(found_email_status)` as the canonical "not attempted" check; ensure migrated rows have a non-null status so they're not re-queued — see note).
- [ ] **Note:** the A6 backfill copies emails into the table but does NOT change `found_email_status`. Existing hit rows have `found_email_status='valid'` already (set by #148 on the original hit), so they stay out of the eligible set. Verify this holds; if any legacy hit row has null status, add a one-time `UPDATE evaluations SET found_email_status='valid' WHERE found_email IS NOT NULL AND found_email_status IS NULL` to the A6 backfill script.
- [ ] Test: eligibility query excludes attempted rows.
- [ ] Commit.

---

## Self-Review
- Covers spec §Part-5 output (widened CSV, subject location columns) ✓, display read from `profile_emails` ✓, AnyMailFinder redirect ✓ (coordinated).
- C4–C5 are the only tasks touching the other agent's surface; isolated here and flagged for coordinated merge.
- Claimer emails stay virtual (merged at read) per the spec ✓.
