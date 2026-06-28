## Progress Update as of 2026-06-12 04:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest origin/main (which had advanced to migration 0056 + a new `marked`/markdown dependency). Resolved the drizzle migration-number collision: took main's drizzle/ wholesale and regenerated the app_settings migration as 0057. Ran pnpm install for the new `marked` dep; tsc clean.

### Detail of changes made:
- Renumbered my migration 0053→0057 (`drizzle/0057_app_settings.sql`); apply script unchanged (CREATE TABLE IF NOT EXISTS, number-independent).
- Conflicts were limited to drizzle journal/snapshot; schema.ts + profile/page auto-merged.

### Potential concerns to address:
- Prod `app_settings` migration still pending (see earlier entry).

## Progress Update as of 2026-06-12 04:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
No code change — empty/no-op push to re-trigger the GitHub Actions CI gates, which did not attach to PR #378 on the initial push (known intermittent on this repo).

### Detail of changes made:
- Re-pushed to make the typecheck/test/lint workflow run.

### Potential concerns to address:
- Same as prior entry: prod `app_settings` migration still pending.

## Progress Update as of 2026-06-12 04:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two things: (1) the requester of a connection request now gets a "PENDING: Connection request to [name] from [event]" confirmation email; (2) a single DROdio sign-off is now appended to EVERY outgoing email, and its text is an editable super-admin setting ("Email options" in the left nav, default = DROdio's spec text).

### Detail of changes made:
- **Connection PENDING email** — `sendConnectionPendingEmail()` in `src/lib/email.ts`; wired into `src/app/api/events/[slug]/connect/route.ts` inside the existing `status === "pending"` block (best-effort, alongside the recipient's approval email). Subject has NO quotes. Links: "Manage your connection preferences" → `/events/[slug]`; "Manage your global connection defaults" → `/account`; plus the partners/kids/pets nudge.
- **Global signature** — appended at the send layer only (so all pure-render unit tests stay green). New internal `rawSend()` chokepoint + exported `appendSignature()`; `sendRawEmail` + the 4 named senders route through it; `admin-alert.ts` calls `appendSignature` too (user chose "truly every email"). Stripped the now-duplicate inline sign-offs from email.ts (×4), endorsement-email, event-chat-email, claim-email, welcome-emails (SIGNOFF_HTML="").
- **Editable signature setting** — new `app_settings(key,value,updated_at)` table (migration 0053 + `scripts/apply-app-settings.ts`, applied to DEV). `src/lib/email-signature.ts`: DEFAULT_EMAIL_SIGNATURE (the spec text), get/set, `renderSignatureHtml` (escape + newlines→<br> + linkify email, mid-gray #888 so it reads on light + dark templates), plus a 60s in-process cache so a burst of emails does one DB read.
- **Super-admin "Email options" page** — `/admin/email-options` (gated on `isSuperAdmin`), `EmailOptionsForm` (textarea + Save + Reset-to-default + live preview), POST `/api/admin/email-options`. Nav: added `superAdminOnly` flag to `admin-nav.ts` (true super-admins only, not role-admins with all grants); threaded `isSuperAdmin` through the admin layout → AdminNav.
- Tests: new `email-signature.test.ts`; updated `connection-intro-email.test.ts` (sign-off moved out of builder) and `admin-nav.test.ts` (super-admin gating).

### Potential concerns to address:
- **PROD migration pending**: `app_settings` is applied to DEV only. Emails work in prod immediately (reads fall back to DEFAULT_EMAIL_SIGNATURE when the table is missing), but the super-admin SAVE will 500 until `scripts/apply-app-settings.ts` runs against prod.
- The signature cache is per-instance with a 60s TTL — a save propagates to other serverless instances within 60s.
- The initiator email fires whenever the request is pending (same gating as the existing recipient email); a duplicate connect click could re-send, mitigated by the UI hiding "Connect" once pending.
