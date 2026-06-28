## Progress Update as of 2026-06-09 10:40 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added optional Reply-To routing for claim emails so inbound replies can land on a dedicated subdomain instead of the live `hello@festival.so` Google Workspace mailbox. **DNS finding:** root `festival.so` MX = Google Workspace (must NOT touch), `send.festival.so` already on Resend outbound, DNS hosted on Cloudflare. No Cloudflare CLI/creds available in this environment, so MX records must be added by the user.

### Detail of changes made:
- `src/lib/email.ts`: `sendRawEmail` now accepts optional `replyTo`.
- `src/lib/claim-thread.ts`: passes `CLAIM_REPLY_TO` env as Reply-To when set (unset = no change).

### Potential concerns to address:
- Inbound go-live checklist (all manual, see end-of-session notes): create `reply.festival.so` (or similar) subdomain in Cloudflare with MX → Resend Inbound target; set `CLAIM_REPLY_TO`, `RESEND_INBOUND_SIGNING_SECRET` in Vercel; point Resend Inbound at `/api/inbound/resend`; run migration 0043 on prod.

## Progress Update as of 2026-06-09 10:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Claim Review Console increment 3: **Email User** (outbound compose from the claim area) + an inbound-reply thread. Each claim gets a lazily-created thread with a short `request_number` (starts at 10000) stamped into the subject as "(Request #NNNNN)"; the user's reply lands on a Resend Inbound webhook, which parses that number and appends the reply to the same thread. Migration 0043 applied to **dev** (prod GATED — needs you to run it).

### Detail of changes made:
- DB: new `claim_threads` (one per score_item, `request_number serial` starting at 10000) + `claim_messages` (outbound/inbound) tables. Schema in `src/db/schema.ts`; migration `drizzle/0043_panoramic_rage.sql` (includes `ALTER SEQUENCE … RESTART WITH 10000`). **Applied to dev only.**
- `src/lib/claim-thread.ts`: `getOrCreateThread`, `sendClaimUserEmail` (validates recipient, stamps subject, sends via Resend, persists outbound msg), `recordInboundReply`, `getThreadForItem`, plus pure `stampSubject` / `parseRequestNumber` helpers.
- `src/lib/svix-verify.ts`: dependency-free Svix HMAC verification (Resend signs inbound webhooks with Svix). Timing-safe, tolerance-checked, supports multiple `v1,` sigs for rotation.
- `src/app/api/score-items/[id]/email/route.ts`: GET (thread + `suggestedTo` = verified profile email) and POST (admin compose+send), both admin-gated.
- `src/app/api/inbound/resend/route.ts`: Resend Inbound webhook — **fails closed** if `RESEND_INBOUND_SIGNING_SECRET` unset, verifies signature, parses `Request #NNNNN`, threads the reply; unmatched mail acked & dropped (no retry-storm).
- `src/components/admin/PendingItemRow.tsx`: "Email User" button → inline compose (To prefilled from verified email, Subject prefilled with the Request token) + the full message thread (sent vs reply styled differently).
- Tests: `tests/lib/claim-thread.test.ts` (11) — request-number parse/stamp + svix verify (valid / tampered / stale / missing-header). All green.

### Potential concerns to address:
- **Inbound not live yet.** Needs (a) `RESEND_INBOUND_SIGNING_SECRET` env in Vercel, (b) Resend Inbound configured to POST `/api/inbound/resend`, (c) Cloudflare MX records for the inbound domain. Until then the webhook returns 503 by design.
- Migration 0043 is **dev-only**; prod still needs it before the email feature works in prod.
- Outbound From is `hello@festival.so`; replies must land on a domain whose MX points at Resend Inbound. Confirm the reply-to domain matches the MX we set.


### Summary of changes since last update
Claim Review Console increment 2: an admin can now **edit** a pending owner-claim (pencil → inline points/reason form, reusing the `modify` action), and **approving** a pending owner-edit now (a) moves the headline score by the exact `points − originalPoints` delta and (b) emails the owner a "Your profile edit was approved" message. Builds on #291 (Run AI Check).

### Detail of changes made:
- `src/components/admin/PendingItemRow.tsx`: added `useRouter`, edit state (`editing`/`editReason`/`editPoints`/`savingEdit`), `saveEdit()` (POST `/api/score-items/[id]` `{action:"modify"}` → `router.refresh()`), a pencil button between AI Check and Reject, and an inline edit form (points input + reason textarea + Save/Cancel) shown when `editing`.
- `src/lib/claim-email.ts` (new): `sendClaimApprovalEmail({to, firstName, profileUrl, originalScore, newScore, newClaim, originalClaim})` → HTML-escaped email from `hello@festival.so`, subject "Your profile edit was approved", new claim shown with the original struck through, "#Velocity, DROdio" sign-off. Best-effort.
- `src/app/api/score-items/[id]/route.ts`: added `applyApprovalSideEffects(item)` — recomputes founder/investor/combined score by the delta (founder_score is a plain sum of row points, so the change is exactly `points − originalPoints`), then best-effort emails the verified owner. Wired into the `confirm` branch via `wasOwnerEditApproval = item.status === "pending" && admin`. Both score-move and email are wrapped so a failure never blocks the approval.

### Potential concerns to address:
- Score recompute assumes founder_score == sum of confirmed/likely row points. If a future change makes scoring non-additive, the delta math breaks — revisit then.
- The approval email only fires when a `profile_emails` row is `verified` for that evaluation; silent no-op otherwise (by design — we don't email unverified addresses).
- Still pending (increment 3+): Email User outbound compose + `claim_messages` thread model (needs migration), and the inbound-reply webhook + Resend Inbound + Cloudflare MX records.
