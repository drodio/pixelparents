# Branch: `admin-profiles-fixes` — progress log

Branched from `main` on 2026-05-26.

Fixes /admin/profiles mislabeling web scores as "API", adds a requester IP +
location column, and renders timestamps in the viewer's local time.

## Progress Update as of 2026-05-26 4:48 PM Pacific
*(Most recent updates at top)*

### Summary
Three changes to /admin/profiles (+ a reusable local-time component), all on main.

### Root cause (source label)
`profiles-scored.ts` derived the source from `request_ip`:
`requestIp != null ? "web" : isBulk ? "bulk" : "api"`. Web-form scores with a
null `request_ip` (older rows, or where the IP header was absent) fell through to
**"api"** — exactly the mislabeling DROdio saw. The real API signal is a CHARGE
(the paid developer API records a `credit_ledger` score_debit); web/bulk are
never charged.

### Detail of changes made:
- `profiles-scored.ts`: new pure `classifyProfileSource({ chargeCents, isBulk })`
  — **charged → api, else bulk, else web**. `listScoredProfiles` uses it (no
  longer keys off request_ip) and now also selects `request_city/region/country`.
  **No prod data mutation needed** — this is a derivation fix that corrects all
  historical + future rows at once.
- `components/LocalTime.tsx`: client component that renders an ISO timestamp in
  the VIEWER's local timezone (`toLocaleString(undefined, …)`), with
  `suppressHydrationWarning` (server renders in UTC, client re-renders local).
- `/admin/profiles`: source pill now correct; added a **"Requester (IP ·
  location)"** column (data was already captured on the eval, just unshown);
  "When" renders via `<LocalTime>`.
- `/admin/score`: "Created" renders via `<LocalTime>`.

### Verification:
- TDD: `classify-profile-source.test.ts` (3, RED→GREEN). Extended
  `profiles-scored.test.ts` with the bug case (null-IP, uncharged, non-bulk →
  "web"). tsc + eslint clean; dev server compiles /admin/profiles + /admin/score (200).

### Still to do (broader "local time everywhere"):
- `<LocalTime>` is reusable; applied to profiles "When" + score "Created" so far.
  Other timestamp displays (job-item "Run at" in feature 1, events, etc.) should
  adopt it too — a quick sweep once the in-flight features land.
