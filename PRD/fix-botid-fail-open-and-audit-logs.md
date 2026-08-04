# fix/botid-fail-open-and-audit-logs

Two things: unblock the parents BotID is locking out of signup, and build the
audit log that would have made every one of this project's recent outages a
five-minute diagnosis instead of a multi-round guessing game.

## Progress Update as of [August 3, 2026 — 8:59 PM Pacific]

### Summary of changes since last update

BotID no longer blocks anyone — it observes and records. Added a full app-wide
audit log (DB-backed, 14-day retention) with an admin explorer, filters,
per-session drill-down, and CSV/JSON export. typecheck / lint / test (**938**) /
build all exit 0, and the log pipeline was verified end-to-end against the
production database.

### The signup block — root cause

A real OHS parent (Ava) hit **"We couldn't verify your browser…"** and could not
create an account. That message is mine, from #194 — it worked exactly as
designed and told us the truth: **BotID classified her as a bot.**

Why that happens to real people: BotID proves humanity via an `x-is-human`
header attached by its CLIENT-side script. That script is a third-party request,
so it is routinely killed by ad/tracker blockers, Brave shields, Safari private
relay, corporate proxies and VPNs. No script → no header → server says "bot".

The failure mode is backwards: a **privacy-conscious parent is MORE likely to be
blocked than an actual bot**, and the person locked out has no way to fix it.

### Detail of changes made:

**1. Bot checks are now observe-only (`lib/bot-gate.ts`).**

- `observeBot()` replaces `checkBotId()` at all three call sites
  (`createDraftSignup`, `createCoParentDraft`, `submitSignup`). Nothing is ever
  rejected; a bot verdict is logged as `bot.flagged` instead.
- Also catches a thrown `checkBotId` — BotID being down must not take signup
  down with it.
- The risk trade is deliberate and small: signups land as unverified draft rows
  behind admin approval AND OHS student-email verification, so a spam row is an
  admin nuisance, not a breach. Blocking a real family is far worse.

**2. Audit log.**

- `lib/db/schema/app-logs.ts` — `app_logs` with when (created_at), who
  (actor_email / actor_signup_id / actor_clerk_id / session_id / request_id),
  where (path, method, status, duration, user agent, ip_prefix), and what
  (level, event, message, context jsonb, error name/message/stack). Indexed on
  created_at, event, session_id, actor_email.
- `lib/logging.ts` — pure helpers, unit-tested:
  - `redactContext()` strips any key matching password/secret/token/authorization/
    cookie/credential/private/signature **at any depth**, survives cycles, clips
    long strings, caps arrays.
  - `safeContext()` hard-caps total serialized size.
  - `truncateIp()` drops the identifying tail (IPv4 → `/24`, IPv6 → `/64`), so we
    can spot one abusive source without pinpointing a household.
  - `toCsv()` RFC-4180 quoting.
- `lib/db/app-logs.ts` — `logEvent()` (**never throws**, callers may
  `void logEvent(...)`), `listAppLogs()` with filters, `appLogStats()`,
  `listAppLogEvents()`, `pruneAppLogs()` (14 days). Self-healing DDL, matching
  every other table here — there is no migrate-on-deploy in this repo.
- `app/(authed)/admin/logs/page.tsx` — explorer: 24h summary strip (clickable
  level/event chips), filters by text/actor/level/event as a GET form (so every
  view is a shareable URL), expandable rows showing full context + stack, and a
  "see everything from this session" link.
- `app/(authed)/admin/logs/export/route.ts` — CSV/JSON export honoring the
  active filters. **Re-checks admin itself**: a route handler is independently
  addressable, so the `(authed)/admin` layout gate does NOT protect it, and this
  endpoint returns real member emails.
- Instrumented: `signup.draft.created`, `signup.draft.failed`,
  `signup.patch.failed`, `bot.flagged`.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (**938** — 16 new logging tests), `build` 0.
- Build output confirms `ƒ /admin/logs` and `ƒ /admin/logs/export`.
- **Verified against the production DB**: created the table + 4 indexes,
  inserted a row, read it back with context intact, ran the retention DELETE,
  and removed the probe row.

### Potential concerns to address:

- **Volume/cost is the main unknown.** Instrumentation is currently limited to
  signup + bot events on purpose. Before logging "everything" (every request),
  watch the row count for a few days — this is a Neon DB with real cost, and an
  unbounded request log could dwarf the actual application data.
- `logEvent` writes inline. It never blocks on failure, but it IS an extra round
  trip on the path it instruments. If it ever shows up in latency, move it behind
  `after()` (already imported in signup actions).
- `pruneAppLogs()` runs opportunistically when an admin opens the page. If nobody
  visits for weeks, nothing is pruned. Fine for now, but a cron would be sturdier.
- The log stores real emails. That's the point (it's for support), and retention
  is short + secrets are redacted + IPs truncated — but it is a new place where
  member data lives, and it is admin-gated for a reason.
- BotID is now purely advisory. If real spam appears, look at `bot.flagged`
  counts first and tighten deliberately with data — do NOT restore hard blocking.
