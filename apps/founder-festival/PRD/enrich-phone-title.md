# Branch: `enrich-phone-title` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
Capture operator/CSV-provided **phone** + **job title** per person, parallel to
the email/subject-location model. Phone's "verified" source remains the claimer's
Clerk phone (read live, like claimer email); the CSV phone is the "provided"
source. Job title has no Clerk equivalent.

### Detail
- Schema: `evaluations.phone` + `job_title`; `scoring_job_items.input_phone` +
  `input_job_title`. Migration `0031_amused_scarecrow.sql`.
- Ingestion: `csv-to-lines` recognizes phone (phone/phone_number/mobile/cell) +
  title (title/job title/role/position) columns, incl. the verbose-header
  substring fallback ("What is your job title?").
- `applyRowEnrichment` writes phone/jobTitle (operator-provided, latest wins);
  threaded through jobs route + scoring-tick.
- Display/CSV: `resolvePhones` (Clerk) + `profilePhoneInfo` (claimer Clerk phone =
  Verified, else provided). Export CSV gains Job Title, Phone, Phone Status.
- Real Luma file: 86 phones + 95 job titles of 117 rows captured. 68 tests; tsc+eslint clean.

### Concerns
- Migration `0031` must be applied to prod BEFORE the code deploys (the row query
  selects the new columns). Apply then merge.
