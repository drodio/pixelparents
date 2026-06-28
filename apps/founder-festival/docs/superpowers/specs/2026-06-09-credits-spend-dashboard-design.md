# Credits & Spend dashboard

**Date:** 2026-06-09
**Branch:** `credits-spend-dashboard`
**Status:** Approved (owner away; full-autonomy build).

## Goal

Consolidate the separate `/admin/credits` and `/admin/spend` admin pages into one
role-aware **"Credits & Spend"** dashboard:

- **Super admins** see **Revenue** (all users' Stripe purchases) above **Spend** (the
  whole system's actual AI cost, broken down).
- **Regular admins** see only **their own** credits — balance, buy packs, a total-spent
  figure, and their own activity ledger. No global revenue, no true-cost breakdown.

Plus: the spend detail table defaults to **date-descending** and every column is
**click-to-sort**.

## Decisions (from brainstorming)

- **Regular-admin "spend" = credits they were charged** (sum of their own debits), shown
  as a single total — no AI-agents/deep-research breakdown. (Avoids leaking true cost,
  which the cost-multiplier already hides; and needs no eval→admin attribution.)
- **Revenue = net** (topups − refunds/chargebacks). Per-user "Purchased" is net too. A
  "Refunded" column appears only when refunds exist.
- Super-admin spend stays the existing global actual cost (×1), broken into **AI Agents**
  (LLM) / **Deep Research** (Exa), structured so a third category can be added later.

## Architecture

### Routing / nav
- `/admin/spend` becomes the canonical combined page (reads `?topup` and `?source`).
- `/admin/credits` re-exports the same page component, so Stripe `success_url`
  (`/admin/credits?topup=success`) and the `insufficient_credits` `topupUrl` deep links
  keep working.
- `src/lib/admin-nav.ts`: replace the two entries ("Credits", "Spend") with one
  **"Credits & Spend"** → `/admin/spend`, `alwaysOn` (every admin has credits).

### Data layer
- `src/lib/revenue.ts`
  - `buildRevenueSummary(inputs)` — **pure**: from per-user ledger aggregates
    (`grossTopupCents`, `refundedCents`), `balances`, and resolved `identities`, computes
    each row's `purchasedNetCents = gross − refunded`, `refundedCents`, `remainingCents`,
    plus totals + `hasRefunds`. Unit-tested.
  - `getRevenueSummary()` — DB wrapper: aggregates `credit_ledger` grouped by
    `clerk_user_id` (topup gross, stripe_refund), joins `credit_balances` for remaining,
    resolves identities, returns the pure result.
  - `resolveIdentities(ids)` — `admin_access` first (email/name, kind=`admin`), then a
    batched Clerk `users.getUserList` for the rest (kind=`api` if they hold an API key,
    else `user`); falls back to the clerk id.
- `src/lib/credits.ts` — add `getSpentCents(clerkUserId)` (Σ −delta for
  `score_debit` + `find_email_debit`) for the regular-admin "Total spent".
- `src/lib/spend/recorded.ts` — `listEvalCosts` default **date-desc**, cap raised to 500.
- `src/lib/sort.ts` — pure `sortRows(rows, accessor, dir)` (stable) shared by the tables.

### UI
- `src/components/admin/useSortable.ts` — client hook over `sortRows`:
  `{ sorted, sortKey, dir, toggle }`.
- Dedicated **client** tables (columns defined internally so nothing un-serializable
  crosses the server boundary), all using `useSortable`, all with clickable headers +
  a sort caret:
  - `RevenueTable` — User · Purchased · [Refunded] · Remaining; default Purchased↓.
  - `SpendDetailTable` — Subject · Model · LLM · Exa · Total · When; default When↓;
    takes `costMult` (×1 for super admins).
  - `ActivityLedger` — the regular-admin ledger, sortable; default When↓.
- `src/app/(authed)/admin/spend/page.tsx` — role-aware:
  - super admin → `<h1>Credits & Spend</h1>` + Revenue (total + `RevenueTable`) +
    Spend (`SpendSummary` ×1 + `SpendDetailTable`).
  - regular admin → enhanced `AdminCredits` (balance, **Total spent**, buy packs,
    `ActivityLedger`).
- `AdminCredits` gains a `spentCents` prop + a Total-spent stat and the sortable ledger.

### Identity / privacy
- `isSuperAdmin()` strictly gates the Revenue section and the global Spend. A regular
  admin's page never queries global revenue or true costs — only their own
  `getBalanceCents` / `getSpentCents` / `/api/developers/credits` ledger.
- `/api/developers/credits` adds `spent_cents` to its response (Σ of the caller's
  debits) so the regular-admin total is exact (not limited to the last 100 ledger rows).

## Testing
- `buildRevenueSummary`: net math (gross − refunds), totals, `hasRefunds`, per-user rows.
- `sortRows`: asc/desc, stability, null handling, by number/string/date.
- `getSpentCents` shape (pure-ish; covered via the sort/revenue units + typecheck/build).
- Role-gating verified by the build + a prod smoke test (super-admin vs regular paths).

## Out of scope
- Changing markup/multiplier or the credit mechanics.
- Per-eval cost→admin attribution (unneeded — regular-admin spend = their charges).
- Date-range filters / CSV export (possible fast-follow).

## Deploy
Additive (one new lib, UI components, an API field, nav copy). **No DB migration.**
Deploy to prod per `deploy-every-time`.
