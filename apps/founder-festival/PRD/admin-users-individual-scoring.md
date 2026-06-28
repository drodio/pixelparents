# Branch: `admin-users-individual-scoring` — progress log

Branched from `main` (post PR #62).

## Progress Update as of 2026-05-26 5:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `main` (was 23 commits behind — Founder Score API
Phase-2 billing PR #61, founder-signals #63, low-signal-gate #64).

Migration renumber: main added `0009_flowery_sumo` (FK cascade fix)
and `0010_tough_puff_adder` (credit_balances + credit_ledger billing
tables), colliding with my `0009_wooden_terrax`. Resolved by resetting
`drizzle/` to main's state, dropping my old 0009, and regenerating
against the merged schema → **`0011_fantastic_wild_child.sql`** (same
content: 4 request_* columns + index). schema.ts + eval-pipeline.ts
auto-merged cleanly; my columns + requester wiring survived. Ran
`pnpm install` (billing PR added `stripe`).

### Migration status (UPDATED)
- DEV: request_* columns already applied (idempotent).
- PROD: user authorized — applying `0011_fantastic_wild_child.sql`
  (request_* columns + index) to the prod Neon branch before merge.

---

## Progress Update as of 2026-05-26 4:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New **/admin/users** page that lists individual user-initiated scoring
requests (NOT bulk jobs) so the operator can track who is spending
money scoring profiles, from where, on which profile, and whether
that profile has been claimed.

Decision (asked the user): individual requests live on a NEW
/admin/users page; the bulk-jobs view stays on /admin (NOT renamed to
/scoring).

### How it works
- Added 4 columns to `evaluations`: `request_ip`, `request_city`,
  `request_region`, `request_country` (+ index on request_ip).
- `getRequestGeo(headers)` (src/lib/request-ip.ts) reads the IP plus
  Vercel's `x-vercel-ip-city` / `-country-region` / `-country` (city
  is URL-encoded; decoded). Locally only the IP is present.
- `/api/eval` and `/api/rescore` pass `{ requester: getRequestGeo(...) }`
  into runEval / reEvaluate, which persist the requester fields.
- The **bulk cron** (scoring-tick) does NOT pass a requester, so bulk
  evals keep `request_ip = null`. That's the discriminator: the
  /admin/users query is `WHERE request_ip IS NOT NULL`. (NB: bulk and
  individual both use source="url", so source alone can't distinguish
  them — request_ip can.)
- Re-scores update the row to the latest individual requester; cached
  hits change nothing (no new cost, IP untouched).
- Claimed status: left-join `users` on evaluation_id with
  high/medium matchConfidence.
- Profile column links to /profile?e=<id> (auto-upgrades to canonical)
  in a new tab.

### Files
- `src/db/schema.ts` — 4 request_* columns + index.
- `drizzle/0009_wooden_terrax.sql` — migration (ADD COLUMNs + index).
- `src/lib/request-ip.ts` — `getRequestGeo` + `RequestGeo` type.
- `src/lib/eval-pipeline.ts` — RunEvalOptions.requester; persist in
  runEval + reEvaluate.
- `src/app/api/eval/route.ts`, `src/app/api/rescore/route.ts` — capture
  + pass requester.
- `src/app/(authed)/admin/users/page.tsx` — NEW page.
- `src/app/(authed)/admin/layout.tsx` — "Users" nav link.

### Migration status
- DEV (ep-old-shadow): APPLIED (columns + index present).
- PROD (ep-fragrant-surf): NOT applied. MUST be applied BEFORE this
  code reaches prod — otherwise /api/eval + /api/rescore INSERT/UPDATE
  request_ip against a missing column and prod scoring 500s. Do not
  merge until prod migration is run. Awaiting explicit authorization
  to apply drizzle/0009_wooden_terrax.sql to prod.

### Verified
- `pnpm tsc --noEmit` clean.
- /admin/users → 307 redirect when unauthenticated (gate works).
- Dev already captured a real individual request:
  "Daniel Rubén Odio · ip=::1 · $0.18".

### Potential concerns
- MVP stores the LATEST requester per profile, not a full per-request
  audit log. If true multi-request cost history is needed later, add a
  `scoring_requests` log table. Noted but out of scope for this pass.
