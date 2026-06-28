## Progress Update as of 2026-06-09 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the consolidated, role-aware **"Credits & Spend"** admin dashboard. Brainstormed
+ approved; design spec at `docs/superpowers/specs/2026-06-09-credits-spend-dashboard-design.md`.
No DB migration. Unit tests pass; `next build` clean.

### Detail of changes made:
- One role-aware page at `/admin/spend` (alias `/admin/credits`), rendered by the new
  server component `src/components/admin/CreditsAndSpendView.tsx`:
  - **Regular admin:** their own balance, **Total spent** (Σ their debits via
    `getSpentCents`), buy-credit packs, and a sortable activity ledger. No global
    revenue, no true-cost breakdown.
  - **Super admin:** **Revenue** (all Stripe purchases, net of refunds — per-user table
    via `getRevenueSummary`, identity resolved from `admin_access` then Clerk) over
    **Spend** (global actual AI cost ×1, AI-Agents/Deep-Research cards + sortable detail).
- New `src/lib/revenue.ts`: pure `buildRevenueSummary` + DB `getRevenueSummary` +
  `resolveIdentities` + `getSpentCents`.
- New `src/lib/sort.ts` (pure, stable, nulls-last) + `src/components/admin/sortable.tsx`
  (`useSortable` hook + `SortHeader`). Tables: `RevenueTable`, `SpendDetailTable`, and
  the ledger in `AdminCredits` — all click-to-sort; spend detail defaults date-desc.
- `listEvalCosts` now orders by date-desc, cap 500.
- Nav: collapsed "Credits" + "Spend" into one always-on "Credits & Spend" (→ /admin/spend);
  updated `admin-nav.test.ts`.
- `SpendSummary` cards no longer link to the removed `?source` filter.

### Potential concerns to address:
- Regular admins previously could see global spend (× their multiplier); now they see
  only their own credits/charges (intended — true costs stay hidden, no eval→admin
  attribution needed).
- Revenue identity for non-admin (API/dev) purchasers needs a Clerk lookup; falls back
  to the clerk id if Clerk is unavailable.
- Known local test flakiness (eval-pipeline / hn-tokenmaxxing / select-top-profiles) is
  pre-existing and excluded in CI.
