# Credit admin photo uploads to the uploader's profile

## Progress Update as of 2026-06-09 2:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin photo uploads now get an "added by" credit even when the admin's login isn't
linked to a claimed evaluation, by resolving their profile via their verified email.
Adds a backfill script for the 79 existing (uncredited) admin photos.

### Detail of changes made:
- Diagnosis: prod has 79 `source='admin'` photos, all with `uploaded_by_evaluation_id = NULL`,
  because `getViewerEvaluationId()` reads `users.evaluationId` and the admin account isn't
  linked to a claimed profile → no credit. Code path (join/wiring/render) was already correct.
- `api/admin/events/[id]/photos` POST: when `getViewerEvaluationId()` is null, fall back to
  `getViewerEmail()` → `profile_emails` lookup to find the uploader's evaluation.
- `scripts/credit-admin-photos.cjs`: FIND mode lists evaluations matching an email/name;
  BACKFILL mode (pass an evaluation UUID) sets `uploaded_by_evaluation_id` on all null
  `source='admin'` rows. Run on prod via `.env.prod.local`.

### Potential concerns to address:
- The backfill credits ALL legacy admin photos to one evaluation — correct only if a single
  admin (DROdio) uploaded them. Fine here; revisit if multiple admins uploaded historically.
- Forward fix relies on the admin's Clerk email existing in `profile_emails`; if it isn't,
  the credit stays null (no regression).
