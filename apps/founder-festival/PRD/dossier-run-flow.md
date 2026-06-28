# dossier-run-flow

## Progress Update as of 2026-06-22 02:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The public share link now scrolls to the report heading. `dossierShareUrl` adds
`?start=&end=` (same value → point scroll) in addition to `?leaf=`, matching the
chief.bot FE constructor Alex described. Anchor = the static H1 phrase
"Deep Intelligence Dossier on" with whitespace stripped, so it works for every
profile.

### Detail of changes made:
- `src/lib/chief.ts` — `DOSSIER_SCROLL_ANCHOR = "Deep Intelligence Dossier on"`;
  `dossierShareUrl` now returns
  `…?start=DeepIntelligenceDossieron&end=DeepIntelligenceDossieron&leaf=<msg>`.
  chief.bot matches scroll-to text with whitespace removed, so the anchor is the
  prompt's H1 phrase minus spaces.
- `tests/app/dossier-prompt.test.ts` — updated dossierShareUrl expectations (6 pass).

### Potential concerns to address:
- The scroll-to relies on chief.bot's text matcher (start/end with whitespace
  stripped). If their matching changes or the heading wording changes, update
  `DOSSIER_SCROLL_ANCHOR`. Verify against a real generated dossier on preview.

## Progress Update as of 2026-06-22 01:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pushed branch + opened PR #410. Added an idempotent prod-apply script for the
0064 columns so the required prod migration can be run via the documented
`DOTENV_CONFIG_PATH` pattern (no db:push, no raw prod writes from an agent).

### Detail of changes made:
- `scripts/apply-dossier-columns.ts` (NEW) — mirrors `apply-app-settings.ts`;
  `ADD COLUMN IF NOT EXISTS` for `profile_dossiers.buyer_clerk_user_id` + `error`;
  prints the target host before writing; safe to re-run.
- PR #410 opened against main (branch `dossier-run-flow`).

### Potential concerns to address:
- **Run the prod migration before merging #410** or the run endpoint insert fails.
  Command: `DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config
  scripts/apply-dossier-columns.ts` (confirm it prints the prod host).

## Progress Update as of 2026-06-22 01:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a super-admin "Admin" run-free button to the dossier modal: a red button to
the right of $1,000 (in both the funded top-up grid and the underfunded buy grid)
that runs a dossier WITHOUT deducting credits. Authorization is enforced
server-side via `isSuperAdmin()` — the client flag alone never grants a free run.

### Detail of changes made:
- `src/app/api/dossier/run/route.ts` — accepts `admin?: boolean`; `adminRun =
  body.admin === true && await isSuperAdmin()`. When adminRun: skip
  `reserveCredits`/402, no `refundCredits` on failure, no `linkDebitEvaluation`,
  and the row's `buyer_clerk_user_id` is null. Response echoes `admin`.
- `src/lib/profile-dossier.ts` — `startDossier.buyerClerkUserId` is now
  `string | null` (free admin runs have no buyer to refund).
- `src/components/ProfileDossierBox.tsx` — new `superAdmin` prop (box + modal);
  `run(admin)` sends the flag; red `AdminRunButton` rendered after the packs in
  both grids when `superAdmin`. Fixed the funded "Run dossier" handler to
  `() => run(false)` (was passing the click event as the admin arg).
- `src/app/(authed)/profile/page.tsx` — passes the already-computed `superAdmin`.

### Potential concerns to address:
- Admin run still respects the 409 dedupe (can't re-run a running/ready dossier).
  If admins later want forced regeneration, that's a separate change.

## Progress Update as of 2026-06-22 01:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Dropped in the user's finalized Chief prompt (richer format: Likely Superpower,
At A Glance 1–7, Inferred Interpersonal Characteristics, Fun Facts, with the
[red circle emoji]/[orange emoji] markers and the AI-generated disclaimer in the
OUTPUT itself). `{{ff.*}}` fields are filled server-side; `[bracketed]` text is
left verbatim for Chief.

### Detail of changes made:
- `src/lib/dossier-prompt.ts` — `DossierSubject` now takes `nickname` + `fullName`
  (was a single `name`). Renders "Nickname (Full Name)" for the SUBJECT line and
  H1, dropping the parens when there's no nickname ("Daniel R. Odio"); section
  headers use the display name (nickname else full name).
- Fixed four obvious typos inside the user's bracketed instructions (they don't
  change meaning): "ofcompanies"→"of companies", "iwth"→"with",
  "characteristcs"→"characteristics", and added the missing space in the
  "## …'s Likely Superpower" heading so it's valid markdown like the others.
- `src/app/api/dossier/run/route.ts` — passes `nickname`/`fullName` to the builder.
- `tests/app/dossier-prompt.test.ts` — updated for the new signature; covers the
  nickname-present vs no-nickname name forms (6 passing).

## Progress Update as of 2026-06-22 01:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the in-app "Run a Deep Intelligence dossier" flow end-to-end: a signed-in
buyer runs a dossier from a profile, is charged $50, Chief generates it in the
background, and the result links out to a PUBLIC chief.bot share page. Confirmed
the Chief HTTP share endpoint exists (`POST /v1/chats/{chat}/share` → public
share URL) so we link out instead of hosting a view page. Builds clean; new unit
tests pass.

### Detail of changes made:
- **Decision (user):** dossiers are PUBLIC (anon can view) and we RETURN the Chief
  page (link out), not a self-hosted render. Identity anchor + cited source in the
  prompt is the Founder Festival profile URL, NOT LinkedIn.
- **Chief share is reachable over HTTP** — verified live against a real chat in our
  project: `POST https://api.storytell.ai/v1/chats/{chat_id}/share` → `200
  {"is_shared":true,"url":"https://chief.bot/shared/chat/<hash>"}`. The hash ≠
  chat_id. The `?leaf=<message_id>` scroll-to is built FE-side (we replicate it).
  The `?start=&end=` text anchor is FE-only and skipped.
- `src/lib/dossier-prompt.ts` (NEW) — `buildDossierPrompt({name, ffUrl, title,
  location})`. Isolated module so the wording is a one-line swap (an updated prompt
  from the user is pending). Posture: public, fact-based, sourced; excludes
  personality/"red flags"/unverifiable; includes the AI-generated disclaimer at top.
- `src/lib/chief.ts` — added `chiefShare(chatId)` (idempotent POST → share url) and
  `dossierShareUrl(base, messageId)` (appends `?leaf=`/`&leaf=`).
- `src/lib/credit-packs.ts` — added client-safe `DOSSIER_COST_CENTS = 5000`.
- `src/lib/profile-dossier.ts` — added `startDossier`, `listGeneratingDossiers`,
  `markDossierReady`, `markDossierFailed` (status machine: running→ready/failed).
- `src/app/api/dossier/run/route.ts` (NEW) — Clerk-authed POST `{evaluationId}`.
  Dedupes (409 if running/ready), `reserveCredits($50)` (402 if underfunded),
  `chiefSubmit(research)`, persists running row + `buyer_clerk_user_id`, links the
  debit. Refunds + bails if submit fails. Name/location resolved from the
  high-confidence `users` claim (nickname/city) with `evaluations` fallback —
  mirrors the profile page.
- `src/lib/chief-dossier-sweep.ts` + `src/app/api/cron/chief-dossier-sweep/route.ts`
  (NEW) — every-minute cron mirroring `chief-insights-sweep`. Polls running rows;
  on ready → ensure share + store `?leaf=` link + raw markdown + credits; stale
  (>20 min) → fail + refund the buyer. Registered in `vercel.json`.
- `src/components/ProfileDossierBox.tsx` — added a "Generating… (~10 min)" running
  state; the modal now RUNS the dossier (deduct $50) when funded, and only sells
  credits when underfunded. Box now takes `evaluationId` + `status`.
- DB: `drizzle/0064_perpetual_dark_phoenix.sql` adds `buyer_clerk_user_id` + `error`
  to `profile_dossiers` (+ schema.ts). **NOT applied to prod** — user runs the
  documented manual migration step before merge.
- Tests: `tests/app/dossier-prompt.test.ts` (5 passing) cover the prompt builder
  and the leaf-URL constructor (the two pure pieces).
- Beads: ff-exe (this feature) claimed/in-progress.

### Potential concerns to address:
- **Prod migration is a prerequisite** for merge: `profile_dossiers` needs the two
  new columns or the run endpoint's insert will fail. Run it via the documented
  manual step (explicit confirmation) before/at merge.
- The Chief prompt wording is pending the user's update; swap is `dossier-prompt.ts`
  only.
- Cost is a flat $50 regardless of Chief's own credit spend (`total_credits` is
  recorded for visibility, not used for pricing). Intentional.
- No automated test for the run endpoint or sweep (DB/Clerk/Chief network) — those
  follow the repo's existing "CI Neon branch is source of truth" pattern; smoke
  test on the dev server / preview deploy before merge.
