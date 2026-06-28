# Branch: `security-hardening` — lock the app down against abuse

A security review (see chat audit 2026-05-26) found the real exposure is
**authorization & abuse**, not leaked secrets (secrets hygiene is clean). The
app's middleware (`src/proxy.ts`) only protects `/dashboard(.*)`, so every API
route must defend itself — and several didn't. This branch fixes the approved
findings (everything except #4, the score-ceiling work, which the operator
deferred).

## Findings being fixed
- **#1** Public money-spend endpoints (`/api/eval`, `/api/find-handle`,
  `/api/rescore`) had only per-IP rate limits → credit-drain DoS. NOTE: these
  are the **public acquisition funnel** (anonymous "Check My Score"), so we did
  NOT hard-require login (that would break signups). Instead added a **global
  daily circuit-breaker** that caps total paid ops/day regardless of IP.
- **#2** `/api/redeem` (invite codes) had no rate limit → brute-forceable.
  Added per-IP + global limits and a failed-attempt lockout.
- **#3** `/api/rescore` let anyone re-roll/overwrite ANY eval. Now requires
  auth + ownership (or admin); returns a generic error (no raw message leak).
- **#5** Prompt-injection: untrusted profile text was concatenated raw with a
  forgeable `BEGIN-DATA/END-DATA` delimiter. Now sanitized + a per-request
  random nonce makes the boundary unforgeable.
- **#6** `/api/recommendations` (POST+DELETE) was an unauthenticated IDOR. Now
  requires auth + ownership (or admin).
- **#7** GitHub enricher attached an account on a single shared name token (or
  none) → famous-account hijack. Now requires a trusted Exa-surfaced GitHub URL
  OR a strong (first+last) name match.
- **#8** Cron `scoring-tick` trusted `Host: localhost` to skip `CRON_SECRET`.
  Now the localhost bypass only applies outside production.
- **#9** `isAdmin` matched any email, verified or not. Now verified emails only.
- **#10** IP derivation: documented + test-pinned that only the Vercel-set
  `x-vercel-forwarded-for` is trusted; spoofable headers are dev-only fallback.
- **Bonus** Removed a debug `console.log` in `(authed)/layout.tsx` that dumped
  signed-in users' emails + phone numbers to server logs.

## Deferred
- **#4** No cap on breakdown row count / final score ceiling (leaderboard score
  inflation). Operator chose to handle separately — needs rubric judgment.

---

## Progress Update as of 2026-05-26 03:51 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Finished the branch: cron auth (#8) and scoring integrity (#5, #7). All
approved findings (everything except deferred #4) are now implemented. `tsc`
clean, eslint clean, 147 vitest tests pass (13 new).

### Detail of changes made:
- `/api/cron/scoring-tick` (#8): the `Host: localhost` bypass now only applies
  when `VERCEL_ENV !== "production"`. In prod, `CRON_SECRET` is always required
  (Host is client-spoofable). Local auto-driver + preview unaffected.
- `src/lib/scoring.ts` (#5): `buildScoringPrompt` now wraps untrusted data in a
  `BEGIN-DATA-<nonce>/END-DATA-<nonce>` envelope (random per request) and runs
  every untrusted segment (subject URL, highlights, LinkedIn text, enrichment,
  MM domains) through new exported `sanitizeUntrusted()`, which strips the nonce
  and defangs forged `BEGIN-DATA`/`END-DATA` tokens + long `====` rules. Guard
  text reworded so the prompt's ONLY raw delimiter tokens are the nonce'd ones.
- `src/lib/enrichers/github.ts` (#7): extracted pure `isConfidentGithubMatch()`.
  A guessed handle is now accepted only if corroborated by an Exa-surfaced
  GitHub URL OR a strong name match (first+last for multi-part names). Closes
  both the single-token-match and the no-GitHub-name auto-accept holes.
- Tests: `tests/lib/request-ip.test.ts`, `tests/lib/github-enricher.test.ts`,
  and new cases in `scoring.test.ts` for the nonce envelope + sanitizer.

### Potential concerns to address:
- Need to verify `VERCEL_ENV` is "production" on the prod deployment (Vercel
  sets it automatically) and that `CRON_SECRET` is configured there, or the
  scheduled cron will 403.
- Stricter GitHub matching may drop some legit matches where the person has no
  name set on GitHub and no Exa-surfaced GitHub URL — acceptable security trade.

## Progress Update as of 2026-05-26 03:47 AM Pacific

### Summary of changes since last update
Landed the shared primitives (#9, #10, ownership helper, PII-log removal) and
the endpoint-hardening pass (#1, #2, #3, #6). Cron (#8) and scoring integrity
(#5, #7) still to come.

### Detail of changes made:
- `src/lib/rate-limit.ts`: added `withinGlobalDailyLimit(bucket, limit)` — a
  per-UTC-day global circuit-breaker (namespaced `global:<bucket>` rows in the
  existing rate_limit table). This is the real backstop vs. IP rotation.
- `/api/eval` + `/api/find-handle`: per-IP limit unchanged; added the global
  breaker (`EVAL_GLOBAL_PER_DAY` default 800, `FIND_HANDLE_GLOBAL_PER_DAY`
  default 1500). Kept these ANONYMOUS — they're the public funnel (#1 approach
  change, documented above).
- `/api/rescore`: now requires auth + `isEvalOwner` (or admin), per-USER limit
  (`rs:<userId>`), shares the eval global budget, and returns a generic error
  instead of leaking `err.message` (#3).
- `/api/recommendations`: POST + DELETE now gated by a shared `gate()` =
  auth + owner/admin (#6, was an unauthenticated IDOR).
- `/api/redeem`: per-IP (`REDEEM_PER_DAY_LIMIT` default 15) + global
  (`REDEEM_GLOBAL_PER_DAY` default 300) attempt caps; every guess burns a slot
  so brute force locks out for the day (#2).

### Potential concerns to address:
- New env knobs (EVAL_GLOBAL_PER_DAY, FIND_HANDLE_GLOBAL_PER_DAY,
  REDEEM_PER_DAY_LIMIT, REDEEM_GLOBAL_PER_DAY) need to be set in prod/Vercel if
  the defaults aren't right; unset → defaults apply.
- Requiring ownership on `/api/rescore` means the `/not-this-round` "Re-Score
  Me" CTA now needs the visitor to sign in + claim first. That's intended (it's
  the re-roll vector) but is a funnel UX change worth confirming.
- Re-rolling YOUR OWN claimed score is still possible up to the per-user limit;
  fully stabilizing it is part of deferred #4.
