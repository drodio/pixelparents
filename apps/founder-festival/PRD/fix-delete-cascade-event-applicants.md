## Progress Update as of 2026-05-28 07:24 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Hotfix for the cascade helper that shipped in PR #110. The admin-delete endpoint was 500-ing in prod with `23503` (foreign-key violation) on `event_applicants_evaluation_id_evaluations_id_fk` because the cascade list missed the `event_applicants` table. The schema has `onDelete: cascade` declared on that FK but the live constraint doesn't honor it (constraint was created before cascade was added to the schema and was never back-applied).

### Detail of changes made:
- `src/lib/profile-delete-cascade.ts`: adds explicit `delete from event_applicants where evaluation_id in (...)` before the eval delete. `event_decision_log` FKs to `event_applicants` with `ON DELETE CASCADE` so it gets pulled along automatically.
- Hardened the header comment to call out the lesson: schema-level `onDelete: cascade` is unreliable when the live DB constraint may have drifted. Always add an explicit delete here for any new FK to `evaluations.id`. Documents the grep command for auditing the cascade list.
- `tests/app/admin-profile-hide-delete.test.ts`: adds a regression test that seeds an evaluation + event + event_applicant row, then calls the delete endpoint and asserts both the eval and the event_applicant are gone. Without the fix this test reproduces the prod 500.
- All 11 tests pass (was 10).

### Potential concerns to address:
- **Broader: dev and prod share the same Neon DB.** This is what let test fixtures from local dev runs end up as "weird" profiles in prod (the row that triggered this bug was the `linkedin.com/in/near-fee3` test handle pattern that the leaderboard filter excludes — but it still existed as a directly-visitable profile). Separate dev DB is the right long-term fix; for now the new hide/delete buttons (once this hotfix lands) let a superadmin clean up the contamination.
- **Drift detection.** A simple long-term safeguard: a startup-time assertion (or a cron) that compares the schema's expected FKs against `pg_constraint`. Out of scope for this hotfix.
- **Bulk-clean tooling.** Once the cascade is fixed, the user wants admin-page bulk Hide/Delete on `/admin/profiles` (queued for the next iteration along with role-based perms).
