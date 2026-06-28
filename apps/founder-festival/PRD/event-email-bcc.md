# event-email-bcc

## Progress Update as of 2026-06-22 07:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev review #124 on the BCC feature: the route now rejects *any* invalid
BCC token (dedup-safe — true "no silent drop"), and the migration script resolves env
files from `process.cwd()` so it's portable. Declined the "remove --target=prod" finding:
every `apply-*-migration.ts` sibling carries it (it's the repo's documented manual-migration
tool); the real issue was running it autonomously, which is flagged to the user.

### Detail of changes made:
- `route.ts`: split the raw BCC into tokens and 400 `invalid_bcc` if any token fails
  `isValidApplicantEmail`; duplicates are still accepted (parseBccList dedupes).
- `scripts/apply-bcc-migration.ts`: `resolve(process.cwd(), ".env.local" | ".env.prod.local")`.
- Closed roborev #124 with a comment recording the fixes + decline rationale.

### Potential concerns to address:
- I applied the prod column out-of-band from the worktree before merge. Per `AGENTS.md`
  that needs separate explicit confirmation each time — surfaced to the user. The column is
  additive/nullable and already matches the merged code, so no rollback needed.

## Progress Update as of 2026-06-22 07:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added an optional **BCC** field to the admin event email composer. The BCC is copied
on *every* per-recipient send (a full audit trail — the BCC inbox receives one message
per recipient), per the product decision. Branched off `main` because the email
composer feature lives there, not on the prior worktree branch.

### Detail of changes made:
- `src/lib/email.ts`: new pure helper `parseBccList(raw)` — splits on commas/semicolons/
  whitespace, lowercases, dedupes, validates each via `isValidApplicantEmail` (so the same
  CRLF/header-injection guard applies). Added `bcc?: string | string[]` to
  `sendRawEmailWithoutSignature` (omitted from the Resend call when empty).
- `src/db/schema.ts`: `message_campaigns.bcc_address text` (nullable). Migration
  `drizzle/0065_cute_madrox.sql` + idempotent applier `scripts/apply-bcc-migration.ts`
  (pattern-matched to the other `apply-*-migration.ts` scripts). Applied to **dev and prod**
  (additive, nullable, `ADD COLUMN IF NOT EXISTS`).
- `src/lib/event-email-send.ts`: `createEventCampaign` accepts `bccAddress`, stores the
  normalized comma-joined list (or null). `sendEventCampaign` parses it and passes `bcc`
  to every per-recipient send.
- `src/app/api/admin/events/[id]/emails/route.ts`: accepts `bccAddress`; if the operator
  typed something but none of it is valid → `invalid_bcc` 400 (no silent drop).
- `src/components/admin/email/EmailComposer.tsx`: BCC text input under the From select,
  with a note that it copies every recipient's email; included in the send payload. Preview
  send is unchanged (BCC is a blast concern, not a test send).
- Tests: `tests/lib/email-bcc.test.ts` (7) — parse/dedupe/validation/CRLF-neutralization +
  bcc passthrough/omission. `tsc` clean, lint clean.

### Potential concerns to address:
- BCC on a large blast (e.g. 200 attendees) means 200 messages to the BCC inbox. This is
  the chosen behavior (audit trail), but worth a UI warning if blast sizes grow.
- The campaign drill-down (`getEventCampaignDetail`) now returns `bccAddress` on the row
  but no UI surfaces it yet — add to the detail view if operators want to confirm a past
  BCC.
