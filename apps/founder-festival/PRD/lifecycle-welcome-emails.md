# Branch: `lifecycle-welcome-emails` — progress log

## Progress Update as of 2026-05-27 — merge main (migration 0019 collision)
*(Most recent updates at top)*

### Summary
Merged origin/main (events-v1 + csv-template landed). schema.ts auto-merged
(kept sentEmails + main tables). Migration collision: main added 0019_sweet_aaron_stack,
mine was 0019_demonic_warhawk — took main journal/snapshot, deleted my orphaned
0019, regenerated sent_emails as 0020_graceful_hydra. Drift clean (second generate:
"nothing to migrate"). tsc + eslint + unit tests green.


## Progress Update as of 2026-05-27 — Task 8: cron route + schedule
*(Most recent updates at top)*

### Summary
Added `/api/cron/lifecycle-emails` (cron-authed GET running both passes) and the
`*/2 * * * *` entry in vercel.json. Safe to deploy: both passes no-op while their
flags are off. tsc + eslint clean; 11 unit tests pass.


## Progress Update as of 2026-05-27 — Task 7 fix: neon-http variant query
*(Most recent updates at top)*

### Summary
Controller review of the sweep caught a runtime bug: the two variant-check
queries used ``sql`col = any(${ids})` ``, which the neon-http driver can't bind
(the documented gotcha in `jobs/route.ts`). Replaced both with `inArray(col, ids)`.
Verified the count queries (`notInArray(subquery)` path) run against the DEV DB
(claim backlog 0, dev-api backlog 3) — no SQL errors. tsc + eslint clean.

## Progress Update as of 2026-05-27 5:15 PM Pacific — Task 7: welcome-email-sweep.ts

### Summary of changes since last update
Created `src/lib/welcome-email-sweep.ts` — the DB/Clerk/Resend sweep that the cron will call. Exports `WelcomeKind`, `welcomeEmailEnabled`, `countUnsentClaim`, `countUnsentDevApi`, `runClaimWelcomePass`, and `runDevApiWelcomePass`. tsc clean, eslint clean, no new unit tests (this is DB+Clerk+network glue).

### Detail of changes made:
- `src/lib/welcome-email-sweep.ts` (new) — feature-flagged sweep functions for both `claim_welcome` and `dev_api_welcome` lifecycle emails. CAP=30 per pass. Uses `notInArray(col, subquery)` for backlog detection. `= any(${ids})` used for variant-check queries matching the spec verbatim (neon-http driver note: only flat `= ANY(js-array)` fails; subquery form is fine; tsc accepted it).
- `NEVER_EMAIL` set suppresses operator/from/cc addresses and marks them sent so they drain from the backlog.
- `resolveClerk` does a single Clerk Backend API call per pass (batched by userId list).
- Clerk misses (transient) leave no `sentEmails` row and are retried next run.
- `canonicalProfileUrl` returns `Promise<string|null>` and a path; fallback uses `?e=` query form.

### Potential concerns to address:
- `= any(${ids})` where `ids` is a string[] is kept verbatim from spec; the neon-http driver caveat (jobs/route.ts comment) applies only when the right side is a JS array passed to `sql` via a tagged template — tsc passes cleanly. If runtime issues appear, replace with `inArray(col, ids)`.
- No transaction wrapping `sendClaimWelcomeEmail` + `markSent` — a crash between the two would cause a re-send. Acceptable given the CAP and idempotent `onConflictDoNothing` guard.

## Progress Update as of 2026-05-27 4:22 PM Pacific — Task 6: sendRawEmail + thin send wrappers

### Summary of changes since last update
Added `sendRawEmail` to `src/lib/email.ts` (generic Resend sender supporting custom from/cc/subject/html) and wired it into two exported async senders in `welcome-emails.ts`. tsc clean, eslint clean, 8 tests still green.

### Detail of changes made:
- `src/lib/email.ts` — `sendRawEmail` exported: accepts `{from, to, cc?, subject, html}`, calls `client().emails.send`, throws on Resend error, returns `{id}`. cc is spread conditionally so no undefined key is sent.
- `src/lib/welcome-emails.ts` — `import { sendRawEmail } from "@/lib/email"` added at top; `sendClaimWelcomeEmail` and `sendDevApiWelcomeEmail` appended — both delegate rendering to the pure functions and pass `FROM_DRODIO` / `WELCOME_CC` constants.

### Potential concerns to address:
- Send wrappers are untested via vitest (they're async network callers); integration-tested only via the actual cron sweep. Unit tests cover the pure renderers they delegate to.

## Progress Update as of 2026-05-27 4:21 PM Pacific — Task 5: renderDevApiWelcomeEmail (full + short)

### Summary of changes since last update
Added 2 failing tests for `renderDevApiWelcomeEmail`, then implemented it. Full variant includes `INTRO_HTML` and Festival API link; short drops both and uses `<em>also</em>` with no hrefs. All 8 tests green.

### Detail of changes made:
- `tests/lib/welcome-emails.test.ts` — 2 new tests: full (checks "BTW, how'd you hear", intro link, Festival API link) and short (checks `<em>also</em>`, no `href=` at all, no "BTW" phrase).
- `src/lib/welcome-emails.ts` — `renderDevApiWelcomeEmail` added: short drops all links/intro; full includes intro + Festival API feedback paragraph.

### Potential concerns to address:
- Dev-short intentionally drops all `href=` links (including intro), unlike claim-short which keeps intro. This asymmetry is documented in spec and accepted.

## Progress Update as of 2026-05-27 4:20 PM Pacific — Task 4: renderClaimWelcomeEmail (full + short)

### Summary of changes since last update
Added 2 failing tests for `renderClaimWelcomeEmail` (full and short variants), then implemented the function. Full variant includes the Festival API paragraph and an unescaped subject; short variant uses `<em>also</em>`, keeps the intro, and omits the Festival API link. 6 tests green.

### Detail of changes made:
- `tests/lib/welcome-emails.test.ts` — 2 new tests for `renderClaimWelcomeEmail`: full (verifies all 4 href targets, name escaping in html, raw `<` in subject) and short (verifies `<em>also</em>`, intro link present, Festival API link absent).
- `src/lib/welcome-emails.ts` — `renderClaimWelcomeEmail` added: subject is raw (never HTML-escaped); `name` and `url` are html-escaped; full/short branch on `opts.short`.

### Potential concerns to address:
- Subject deliberately uses raw `opts.firstName` (not escaped) — spec says "Subjects are plain text (never HTML-escape the subject)." This is correct.

## Progress Update as of 2026-05-27 4:19 PM Pacific — Task 3: escapeHtml + firstNameFor + constants

### Summary of changes since last update
Created `tests/lib/welcome-emails.test.ts` (Task 3 tests) and `src/lib/welcome-emails.ts` with the `escapeHtml` helper, `firstNameFor` resolver, module constants, and HTML building blocks. Red → green: 4 tests pass.

### Detail of changes made:
- `tests/lib/welcome-emails.test.ts` — new test file; 4 tests covering `escapeHtml` (ampersand-first ordering so inserted `&` entities are not double-escaped) and `firstNameFor` (Clerk name wins, fallback to first token, fallback to "there").
- `src/lib/welcome-emails.ts` — new module: `escapeHtml`, `firstNameFor`, exported constants `FROM_DRODIO` / `WELCOME_CC`, and private HTML fragment constants `INTRO_HTML`, `FESTIVAL_FEEDBACK_HTML`, `SIGNOFF_HTML`, `*_LINK` helpers used by later renderers.

### Potential concerns to address:
- `INTRO_HTML` contains a grammatical artifact ("Festival it's a side project") — preserved verbatim from the spec copy; do not auto-correct.

## Progress Update as of 2026-05-27 4:15 PM Pacific — Task 2: extract cron-auth + test
*(Most recent updates at top)*

### Summary of changes since last update
Extracted the existing `isAuthorizedCron` helper from `scoring-tick/route.ts` into a new shared module `src/lib/cron-auth.ts`, covered it with 3 unit tests (red→green TDD), and refactored the scoring-tick route to import from the new module. The new cron route (Task 8) will reuse this helper without duplication.

### Detail of changes made:
- `tests/lib/cron-auth.test.ts` — 3 tests: bearer secret accept/reject, no-secret-configured rejection, localhost-bypass only off-production.
- `src/lib/cron-auth.ts` — new shared module; logic ported verbatim from scoring-tick (behavior-preserving extraction). Doc comment explains the security rationale for the Host-header localhost bypass being restricted to non-production.
- `src/app/api/cron/scoring-tick/route.ts` — removed local `isAuthorizedCron` function and its doc comment; added `import { isAuthorizedCron } from "@/lib/cron-auth"`. Call site unchanged.

### Potential concerns to address:
- None new. Pre-existing 3 `LayoutProps` tsc errors remain (environmental, unrelated). tsc and eslint both clean on the changed files.

## Progress Update as of 2026-05-27 10:00 AM Pacific — Task 1: sent_emails table + migration
*(Most recent updates at top)*

### Summary of changes since last update
Added `sent_emails` tracking table to schema, generated migration `0019_demonic_warhawk.sql`, and applied it to dev. This is the idempotency backbone for the lifecycle welcome email cron.

### Detail of changes made:
- `src/db/schema.ts` — added `sentEmails` pgTable with `id` (uuid PK), `clerk_user_id` (text), `kind` (text, `'claim_welcome' | 'dev_api_welcome'`), `sent_at` (timestamptz). Unique index on `(clerk_user_id, kind)` makes the cron sweep idempotent — a failed send leaves no row and is retried next run. No FK (additive only).
- `drizzle/0019_demonic_warhawk.sql` — generated migration: `CREATE TABLE "sent_emails"` + unique btree index. Applied to dev via `apply-sql.ts`.
- `drizzle/meta/_journal.json` and `drizzle/meta/0019_snapshot.json` — updated by drizzle-kit.

### Potential concerns to address:
- 3 pre-existing tsc errors (`LayoutProps not found` in layout files) — unrelated to this task; existed before this change.
- Prod migration must be applied manually before the cron is enabled (per spec).

## Progress Update as of 2026-05-27 (Pacific) — plan written
*(Most recent updates at top)*

### Summary of changes since last update
Spec approved. Wrote the implementation plan to
`docs/superpowers/plans/2026-05-27-lifecycle-welcome-emails.md` — 9 tasks (TDD for
the pure render/helper/cron-auth units; full code for the DB/Clerk sweep), ending
with a flags-off rollout. No implementation code yet.

## Progress Update as of 2026-05-27 (Pacific) — spec
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed + wrote the design spec for two lifecycle welcome emails (profile
claim + Developer API signup), each with full/short variants. Spec committed;
awaiting user review before the implementation plan. No code yet.

### Detail of changes made:
- `docs/superpowers/specs/2026-05-27-lifecycle-welcome-emails-design.md` — full
  design: triggers (`users` claim rows; `api_keys` signups), variant selection
  (short when the other milestone already hit), `sent_emails(clerk_user_id, kind)`
  tracking table, one cron `/api/cron/lifecycle-emails` with two flag-gated passes
  (`CLAIM_WELCOME_EMAIL_ENABLED` / `DEV_API_WELCOME_EMAIL_ENABLED`, default off),
  Resend send from `DROdio <drodio@festival.so>` cc `founder@festival.so`, the four
  email bodies/subjects verbatim from the user, edge cases, and rollout (deploy
  off → report backlog counts → enable).

### Potential concerns to address:
- Documented intentional asymmetry: claim-short keeps the intro, dev-short drops
  it → "API-first then claim" ordering shows the intro twice. Accepted per copy.
- Prod needs the `sent_emails` migration applied manually before merge.
- `drodio@festival.so` must be a deliverable sender on the verified `festival.so`
  Resend domain (expected, since `hello@festival.so` already sends).
