# Branch: `admin-credits` — progress log

Phases 2 + 3 of the admin-credits epic. Stacked on `phase-b-rbac-scope` (PR #92),
so this PR's base is that branch — merge Phase B first.

## Progress Update as of 2026-05-26 8:20 PM Pacific
*(Most recent updates at top)*

### Summary
**Phase 2** — every admin role can buy + hold credits like a developer (same
balance, keyed by clerkUserId). New `/admin/credits` page (balance + buy packs +
activity) and an always-on "Credits" left-nav item. **Phase 3** — bulk scoring
charges those credits at `costMultiplier × real cost`, **behind an off-by-default
flag** (`ADMIN_CREDIT_ENFORCEMENT`), so prod behaviour is unchanged until enabled.

### Detail — Phase 2 (buy credits):
- `admin-nav.ts`: `AdminNavItem.alwaysOn`; `visibleNavItems` includes always-on
  items regardless of grants. New `{ /admin/credits, "Credits", alwaysOn }`.
  Tests updated (TDD).
- `/api/admin/credits/checkout` — admin-gated Stripe checkout, mirrors the
  developer route but redirects to `/admin/credits`. Reuses the SAME packs +
  webhook (`topUpCredits` keyed by clerkUserId) — left the dev billing path
  untouched.
- `/admin/credits` page + `AdminCredits` client: real-$ balance, pack buttons,
  topup banner (read server-side, no useSearchParams/Suspense issue), recent
  activity (reuses `GET /api/developers/credits`, which returns the authed user's
  own ledger). Shows a ×mult note when the role's multiplier > 1.
- Packs + balance are **real dollars** (what they pay Stripe). The multiplier
  inflates what scoring COSTS, not pack value.

### Detail — Phase 3 (enforce charges, flagged off):
- `admin-credit-enforcement.ts` (TDD): `adminCreditEnforcementEnabled()` (env, off
  by default) + pure `reconcileHold({hold, estimated, actual})` (prorate hold by
  actual/estimate = mult×actual; cap at hold; refund the rest).
- `job-credit-hold.ts`: `holdCreditsForJob(clerkUserId, estimate)` — reserves
  `mult × estimate`; returns the hold or an "insufficient" signal. No-op when
  enforcement off, no clerk user, or viewer is **privileged** (super/env admins
  are never credit-blocked — operators can't lock themselves out).
- schema `0018`: `scoring_jobs += created_by_clerk_user_id, credit_hold_cents`.
  Applied to DEV; **PROD needs 0018**.
- Job creation (`/api/admin/jobs` paste + stale modes, `/api/admin/rescore-all`,
  re-run `/api/admin/jobs/[id]`): set `createdByClerkUserId`; under enforcement,
  reserve the hold and 402 ("insufficient_credits", with topupUrl) if unaffordable.
  Re-runs charge the re-run initiator, not the original creator.
- Reconciliation in the scoring-tick worker: on a job's first transition to
  `completed` (covers all-failed too), reconcile the hold → real cost, refund the
  difference, and zero the hold (so it can't double-refund). `grants.ts` gained
  `viewerIsPrivileged()`.

### Verification:
- `tsc` clean, eslint clean, 299 lib unit tests pass (nav, enforcement, reconcile,
  scope, grants). Touched integration tests (rescore-all, profiles-scored) pass in
  isolation; full-suite failures are pre-existing shared-Neon cross-test contention.

### Decisions / for your review:
- **Privileged exemption**: super/env admins are NOT credit-gated even with the
  flag on (prevents owner lockout). The spec said "every role uses credits" — if
  you want super-admins gated too, remove the `viewerIsPrivileged()` short-circuit
  in `job-credit-hold.ts` and seed yourself a balance first.
- **Credits nav is "always on"** for every role (no per-role toggle). "On by
  default for all roles" implemented as universal. Add a toggle later if needed.
- **Per-item gating** is NOT done — we reserve the whole estimate up front and
  reconcile once at completion (simpler + safe; a job you can't afford never
  starts). Mid-job balance exhaustion isn't possible since it's pre-reserved.
- 402 "insufficient_credits" client UX in the new-job form is generic (flag off in
  prod, so unreachable until enabled) — polish when you turn it on.

### Ship notes (HELD — not merged):
1. Merge Phase B (#92) first (needs prod migration **0017**).
2. Apply prod migration **0018** (`created_by_clerk_user_id`, `credit_hold_cents`).
3. Merge this PR. Stripe admin purchases go live immediately; **credit
   enforcement stays OFF** until you set `ADMIN_CREDIT_ENFORCEMENT=on` in Vercel.

### Potential concerns:
- Admin Stripe checkout uses the live Stripe account/keys — buying real credits
  works as soon as this merges. Verify the Stripe product/price display reads well
  before announcing it.
- Enabling enforcement charges role-based admins; make sure they have balances
  (or they'll be 402'd from starting jobs).
