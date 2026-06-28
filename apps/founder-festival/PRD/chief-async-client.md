## Progress Update as of 2026-06-06 1:42 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Foundation for async Chief (X/social) enrichment: a `src/lib/chief.ts` client with
a **call-budget guard** (the only enforceable budget — the API exposes no credit
data). Code only; does NOT auto-run.

### Detail of changes made:
- `src/lib/chief.ts` — `chiefSearch(prompt, opts)` POST→poll→text, fail-safe (null
  on not-configured / HTTP error / timeout), `ChiefBudgetError` thrown at
  `CHIEF_CALL_BUDGET`. `chiefConfigured()`, `chiefCallsUsed()`, `resetChiefCalls()`.
- `tests/lib/chief.test.ts` — 6 tests (config, budget throw, fail-safe, poll loop).
- Env: `CHIEF_API_TOKEN` + `CHIEF_PROJECT_ID` in Vercel (Prod/Dev) + .env.local.

### Credit / cost reality (important):
- Chief's API exposes NO usage/credit data (no endpoint/field/header). We CANNOT
  meter credits. The client counts CALLS; reconcile actual credits in the dashboard.
- Calibrate credits-per-call: run a known batch → read dashboard delta → divide →
  set `CHIEF_CALL_BUDGET = target_credits / credits_per_call`.

### Not yet built (needs DROdio's architecture nod):
- The async ENRICHMENT SWEEP: which profiles to enrich, the X-search prompt(s),
  storing results on the eval, and folding the social signal into the score on a
  later cron pass (Chief is multi-minute → never inline). Spec is in the
  data-source expansion doc. Also needs the budget-enforcement decision (call-cap
  with your credits/call estimate vs. dashboard-calibrated).
