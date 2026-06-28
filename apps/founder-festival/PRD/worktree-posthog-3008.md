# PRD — worktree-posthog-3008

## Progress Update as of 2026-06-14 10:33 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Excluded the owner's own/test usage from the daily metrics digest. Drodio's
identified PostHog person (`drodio@gmail.com`) was generating ~1,085 pageviews in
14 days — dwarfing every other user and badly inflating pageviews, sessions,
session-length, bounce, and LCP. Every HogQL query in the digest now filters out
the configured internal person(s). Validated live: Jun 12 pageviews 195 → 26,
visitors 27 → 26, and top-pages/LCP now reflect real visitors (admin pages and
the 2.54s admin LCP gone). Email-only, zero added cost; PostHog data untouched.

### Detail of changes made:
- `src/lib/daily-metrics.ts`: added `excludeEmails()` (parses
  `METRICS_EXCLUDE_EMAILS`, comma-separated, defaults to `drodio@gmail.com`) and
  `exclusionClause()`, which builds a `person_id not in (select distinct
  person_id from events where lower(person.properties.email) in (…))` fragment.
  Chose **person_id-based** exclusion over a direct email filter because some of
  a signed-in user's pageviews carry a null email at query time (captured before
  the identify-merge resolves); the id mapping catches those too. The headline
  and breakdown query builders now take this fragment; it's injected into all 11
  queries (incl. the nested bounce/duration/new-visitor subqueries) — verified
  each shape parses against live PostHog.
- `tests/lib/daily-metrics.test.ts`: +4 tests for `excludeEmails`/`exclusionClause`
  (parse/lowercase/trim/quote-strip, default, empty → "", fragment shape). 19 pass.
- `.env.example`: documented `METRICS_EXCLUDE_EMAILS`.

### Potential concerns to address:
- The exclusion is **identified-person** based — truly anonymous browsing the
  owner does on a device/incognito where they've never signed in cannot be
  attributed and is still counted. Acceptable: that traffic is minimal and the
  big inflation was the signed-in admin browsing, which is now removed.
- The mapping subquery looks back `interval 90 day` to resolve email → person_id.
  Fine for a stable person; revisit only if person merges go stale.

---

## Progress Update as of 2026-06-10 11:53 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Moved the daily-metrics digest cron from 8am Pacific to **3am Pacific** per request:
`vercel.json` schedule `0 15 * * *` → `0 10 * * *` (UTC). Report logic unchanged —
at 3am the most recent COMPLETE Pacific day is still the full prior day. Updated the
route comment to match.

### Detail of changes made:
- `vercel.json`: daily-metrics schedule now `0 10 * * *` (3am PDT / 2am PST).
- `src/app/api/cron/daily-metrics/route.ts`: comment updated to 3am Pacific.

### Potential concerns to address:
- Same DST drift note as before: fixed UTC `0 10` = 3am PDT (summer) / 2am PST (winter).

---

## Progress Update as of 2026-06-10 11:37 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Built and shipped a **daily PostHog metrics email digest**: a Vercel
cron that emails drodio@festival.so every morning with ~15 site-health metrics for
the prior (Pacific) day, each with a day-over-day delta and a 7-day average, plus
breakdowns (top pages, referrers, countries, devices, browsers). Independent of the
Twilio/A2P SMS work (email-only).

### Detail of changes made:
- **New read-side PostHog client** `src/lib/posthog-query.ts` — `phQuery(hogql)` runs
  HogQL against the PostHog Query API using `POSTHOG_SECRET` (the personal `phx_…`
  read key; the public `phc_…` ingest key in `NEXT_PUBLIC_POSTHOG_KEY` can only
  write). API host derived from the ingest host; project id `443135` (env-overridable
  via `POSTHOG_PROJECT_ID`).
- **Metric gathering** `src/lib/daily-metrics.ts` — `gatherDailyMetrics(run, now)` with
  an INJECTABLE query runner so the shaping/delta logic is unit-testable without the
  network. Day boundaries are `America/Los_Angeles`. Reports the most recent COMPLETE
  Pacific day. Headline metrics: unique visitors, pageviews, sessions, new visitors,
  identified, pages/session, bounce rate, avg session length, avg LCP, errors, rage
  clicks. Breakdowns scoped to the report day. All HogQL validated against live data
  before coding (note the gotchas: `day` is a reserved keyword → alias `d`; `toDate`
  fails on a tz-typed aggregate → use `formatDateTime`; HogQL has no correlated
  subqueries → new-visitors computed via a grouped first-seen subquery).
- **Email render** `src/lib/daily-metrics-email.ts` — pure `renderDailyMetricsEmail`
  → `{subject, html}`, inline styles only. Deltas colored by direction (visitors up =
  green, errors/bounce/LCP up = red). LCP annotated with its Core Web Vitals rating.
- **Cron route** `src/app/api/cron/daily-metrics/route.ts` — `isAuthorizedCron` guard,
  reuses `sendAdminAlert` (Resend) to `drodio@festival.so` (override via
  `METRICS_DIGEST_EMAIL`). `?dry=1` returns the metrics JSON without sending;
  `?dry=1&html=1` returns the rendered email HTML for preview.
- **Schedule** `vercel.json` — added `{ "/api/cron/daily-metrics", "0 15 * * *" }` =
  8am PDT / 7am PST (Vercel crons are UTC, no DST). Crons run prod-only.
- **Tests** `tests/lib/daily-metrics.test.ts` — 15 tests covering tz date math, series
  mapping, delta/format helpers, LCP rating, and an end-to-end gather+render with a
  fake runner. All green. New code typechecks clean.
- **Validated live**: dry-ran the route against production PostHog via the dev server
  (real numbers, e.g. 2026-06-09 = 45 visitors / 159 pageviews / 78.6% bounce) and
  previewed the rendered HTML. The Resend send hop only fires in prod (the key is a
  Sensitive env var, redacted on local `env pull`); it rides the same proven
  `sendAdminAlert` path as existing error/welcome emails.

### Potential concerns to address:
- **First email arrives on the next 8am-Pacific cron tick** — the Resend send couldn't
  be exercised locally (Sensitive key redacted), so prod is the first real send. Worth
  a glance at Vercel cron logs after the first run to confirm a non-null Resend id.
- **Schedule is fixed UTC** (`0 15`) so it drifts an hour with DST (8am summer / 7am
  winter). Acceptable for "morning"; revisit if exactness matters.
- **`POSTHOG_PROJECT_ID` hardcoded default `443135`** — fine for this project; would
  need changing if the project id ever moves.
- **Sibling work still parked**: the PostHog error-watch pipeline (task #1) remains
  blocked on Twilio A2P 10DLC Sole-Proprietor registration (SMS). Email-only error
  alerting already exists via `report-server-error.ts`.
- Pre-existing/unrelated: `tests/lib/hn-tokenmaxxing-enricher.test.ts` fails on clean
  `main` (4 tests, environmental); local `tests/app/*` DB suites need the Neon test
  branch (CI uses `vitest.ci.config.ts`).
