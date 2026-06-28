# Inbound webhook hardening — inbound-webhook-verification

## Progress Update as of 2026-06-10 04:15 PM Pacific — rebase + migration renumber
*(Most recent updates at top)*

### Summary of changes since last update
Rebased onto current main (batches 1/2/3/5 had merged). Main landed its own
`0049_lonely_vanisher`, colliding with my migration. Regenerated the
`provider_event_id` migration as **0050_lonely_grim_reaper** against main's schema
(verified `drizzle-kit generate` then reports "No schema changes"). The
**prod migration was already applied by hand** before this renumber via
`scripts/apply-inbound-webhook-migration.ts` (idempotent `IF NOT EXISTS`, so the
0050 file applying again on a future `migrate` is a no-op). tsc 0.

## Progress Update as of 2026-06-10 — Sprint 1 batch 4 (P0-1)
*(Most recent updates at top)*

### Summary of changes since last update
Closed the remaining P0-1 gaps on the Resend Inbound webhook. The Svix signature
verification + fail-closed-on-missing-secret was already in place; this adds
sender verification and at-least-once idempotency.

### Detail of changes made:
- **Sender verification** (`recordInboundReply`): the request number is a short
  sequential token in the subject, so being on the verified Resend channel isn't
  enough. We now require the reply's From address to match the address we last
  emailed on that thread (`emailsMatch` vs. the most recent outbound message's
  toEmail). Mismatches are acknowledged 200 and dropped (`sender_mismatch`).
- **Idempotency**: new nullable `claim_messages.provider_event_id` + unique index
  (migration 0049). The webhook passes the `svix-id`; a redelivery hits
  onConflictDoNothing and returns `duplicate` instead of appending a second copy.
- `recordInboundReply` now returns an `InboundResult` union
  (`recorded|duplicate|no_thread|sender_mismatch`) instead of a bare boolean; the
  route maps `recorded` → `matched: true` and echoes `result`.
- New pure helpers `extractEmailAddress` / `emailsMatch` (TDD, 6 tests).

### Potential concerns to address:
- Migrations are NOT auto-applied on deploy (build is plain `next build`). The
  0049 column must be applied to each DB by hand via
  `scripts/apply-inbound-webhook-migration.ts` (idempotent, additive, prints the
  target host). Already applied to DEV (ep-old-shadow). PROD still pending — a
  prod DB action requiring confirmation:
  `DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-inbound-webhook-migration.ts`
- Until the prod column exists, the inbound insert would error — but it's wrapped
  in try/catch (200 + logged), so replies are dropped, not crashing. Apply before
  relying on inbound replies in prod. **Do NOT merge #330 to prod before this.**
