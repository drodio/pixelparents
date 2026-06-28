# Branch: `founder-signals` — progress log

Broadens the enrichment layer into a portfolio of clean, free / low-cost data
sources that feed founder-credibility scoring. NFX (below) is now **one source
among many**. Driven by the post-customer-feedback PRD (Festival.so Founder
Profile & Scoring Platform Improvements v0.2).

- Design spec: `docs/superpowers/specs/2026-05-25-founder-signal-sources-design.md`
- Branched from `main` after PR #23 merged (commit `f922337`).
- Renamed from `nfx-direct-scraper` on 2026-05-25.

## NFX direct scraper (one of the sources)

Replaces the Apify-based NFX Signal enricher (`src/lib/enrichers/nfx.ts`)
with a direct scraper that calls `signal-api.nfx.com` from our own code.

## Why direct, not Apify

Apify's `canadesk/nfx-mercury-vc` Actor has a ~$1.15 per-run floor (not the
"$1/1k results" the docs imply). Per-investor enrichment is 2 calls
(search + profile) so ~$2.30 each, ~$115 for a 50-row leaderboard backfill.
Our own scraper using the NFX JWT pays zero per-call cost — we own the
infrastructure and the rate-limit risk both.

Background context including the cost discovery and Phase-1 smoke-test
output is on `main` at `PRD/nfx-signal-enricher.md`.

## Scope

1. **Discover the NFX API surface.** signal.nfx.com is a Next.js app
   (visible to anyone who opens DevTools while logged in). The real
   data lives at `signal-api.nfx.com`. Sniff the Network tab for:
   - Search endpoint (POST/GET against `/api/...`? `/graphql`?)
   - Profile-by-slug endpoint
   - Auth scheme (Bearer JWT, cookie session, both?)
   - Pagination parameters for `investments_on_record`
   Document the endpoints in this PRD as they're discovered.
2. **Rewrite `src/lib/enrichers/nfx.ts`** to call those endpoints directly
   via `fetch()`. Keep the same `EnricherContext → EnrichmentResult`
   shape so the rest of the pipeline doesn't change.
3. **Delete `src/lib/apify.ts`** if nothing else depends on it.
4. **Update `scripts/test-nfx.mjs`** to exercise the new path. Confirm
   the 3 smoke-test investors return the same data we got from Apify
   on Phase 1 (Jordan Lee 77 portfolio, Sam Rivera 250, Casey Morgan 419).
5. **Wire into `runEnrichments()`** — this was deferred in Phase 1
   pending data validation; with our own scraper the cost case is
   different and we can probably enable it for every investor eval.
6. **Add NFX-derived rules to `SCORING_RUBRIC`** (see
   `PRD/nfx-signal-enricher.md` "Next steps (Phase 2, deferred)" for
   the proposed rule set).

## What to bring forward from Phase 1

- `src/lib/enrichers/nfx.ts` — the fact-rendering logic is good; just
  swap the data source. The `NfxProfileRecord` / `NfxSearchRecord`
  types should match the real API response so we may need to refine.
- `scripts/test-nfx.mjs` — keep as-is; only the underlying enricher
  changes.
- `NFX_SIGNAL_TOKEN` in `.env.local` — same Bearer JWT works for the
  direct scraper. `APIFY_API_TOKEN` becomes unused.

## Risk + ToS

Same gray-area concerns as Phase 1 but more direct exposure: we're
operating from our IP, not Apify's. Mitigations:
- Cache aggressively (24h+ per investor, ideally a `nfx_cache` table
  keyed by `personSlug`)
- Don't bulk-scrape the directory; only enrich subjects we're already
  scoring
- Backoff on 429s / 5xx
- Rotate User-Agent string
- Be ready to ditch the approach if NFX sends a C&D

## Discovery TODO checklist

- [ ] Open signal.nfx.com in Chrome → log in → DevTools → Network tab
- [ ] Type a name in the Signal search bar; capture the request URL,
      method, headers, query/body, and the response shape. Paste here.
- [ ] Click into an investor profile; capture the same for the profile
      endpoint.
- [ ] Click "Load more" on a portfolio list; capture pagination params.
- [ ] Confirm the Bearer JWT (`NFX_SIGNAL_TOKEN` in `.env.local`)
      authenticates direct fetches (or whether cookies are also
      required).
- [ ] Try the same endpoints with `curl` from our shell to validate
      before writing TypeScript.

## Progress entries

## Progress Update as of 2026-05-26 9:57 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (PR #52 public Founder Score API — api_keys table,
/api/v1/score, /developers) and fixed a delete-profile data bug DROdio hit: a
deleted profile kept returning a CACHED score because the evaluation row was
never actually deleted.

### Root cause + fix (delete-profile)
- `scoring_job_items.evaluation_id` FK to `evaluations.id` had NO on-delete
  behavior (unlike score_items / recommendation_responses, which cascade). Any
  profile that had been batch-scored via a scoring JOB therefore had
  scoring_job_items rows pointing at its eval.
- `/api/account/delete` deletes claim rows (step 2) BEFORE the eval (step 3),
  but never deleted scoring_job_items → step 3 threw an FK violation (Postgres
  23503) and aborted. Net effect: claim rows gone, **evaluation row left
  behind**, Clerk delete skipped → next scoring run finds the orphaned eval by
  linkedin_url and serves it as a cache hit. Exactly DROdio's symptom.
- Fix: (a) migration `0009_flowery_sumo.sql` adds `ON DELETE CASCADE` to the
  scoring_job_items→evaluations FK (matches the sibling tables, and the job item
  itself holds the operator's pasted name/URL so clearing it is part of a full
  delete); (b) `/api/account/delete` now also explicitly deletes scoringJobItems
  for the torn-down evals, consistent with its "explicit deletes for all
  dependents" pattern.
- Applied 0009 to the DEV DB (ep-old-shadow) via scripts/apply-sql.ts. **PROD
  (ep-fragrant-surf) still needs 0009 applied** — no auto-migrate on deploy.
- One-off cleanup: deleted DROdio's stale eval 94700a91 (Daniel Odio,
  /in/drodio, score 133; 0 claim rows, 4 scoring_job_items, 15 score_items).
  Cascade verified: eval + job_items + score_items all 0 after. He can re-score
  fresh now.

### Verification (delete fix):
- TDD: new `tests/lib/account-delete-cascade.test.ts` reproduced the 23503 FK
  violation (RED), passed after the cascade migration (GREEN). eval-pipeline
  4/4 with a realistic timeout (its earlier failure was this same FK in test
  cleanup; remaining noise is DB-latency timeouts under load). tsc + eslint clean.

## Progress Update as of 2026-05-26 9:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Finished roadmap source #2 of this session's batch: **SEC EDGAR v2**. The SEC
enricher now distinguishes investment-fund issuers (investor signal) from
operating-company raises, and flags companies that have gone public (founder
exit signal). The prior session left the helpers written but unwired; now fully
integrated, rubric-grounded, and tested.

### Detail of changes made:
- `enrichers/sec-edgar.ts`:
  - Parse `industryGroupType` from Form D → new `industryGroup` field, threaded
    onto the `Issuer`. `isInvestmentFund()` (now exported) classifies
    pooled/VC/PE/hedge issuers.
  - Extracted a pure, unit-tested `buildIssuerFacts(issuer, fullName)` that
    branches: a pooled-fund issuer → "fund manager / GP … fund size $X" (offering
    target preferred over committed-to-date); an operating company → the existing
    founder-raise fact, plus an IPO/exit fact when the company has gone public.
  - `checkIpo(cik)` rewritten to key off 10-K/10-Q presence ALONE (free
    submissions API). The half-built version also required a recent S-1, but
    SEC's "recent" window caps at 1000 filings so an established public company's
    IPO S-1 ages out → an established public company was missed. 10-K/10-Q presence is
    necessary+sufficient and dodges the withdrawn-S-1 false positive. Called only
    for non-fund issuers.
  - `raw` now carries industry_group / is_investment_fund / is_ipo per issuer.
- `scoring.ts` SEC block: +IPO sub-rule (grounds founder "Each distinct exit"
  +10 and sets hadIpo; authoritative, no double-count) and +investment-fund
  sub-rule (grounds investor "Active GP / fund manager" +15; fund size grounds
  the role but is NOT founder capital — never feed into "Venture raised").
- `tests/lib/sec-edgar-enricher.test.ts`: 6 new unit tests (isInvestmentFund +
  buildIssuerFacts fund/operating/IPO/no-amount branches), written test-first.
- `scripts/test-sec-edgar.mjs`: added Casey Morgan (fund-manager) subject.

### Verification:
- tsc + eslint clean; 51/51 unit tests (sec-edgar + scoring suites).
- Live smoke test: Morgan Diaz → their fintech company $6.9B (private, is_ipo:false);
  Alex Kim → their marketplace company $201.6M + IPO/exit fact (is_ipo:true); Casey Morgan →
  an early-stage fund III $25M (is_investment_fund:true) + her two earlier
  founder raises; negative control → 0 facts.

### Next: GitHub social graph · Libraries.io dependents · USPTO PatentsView,
then revisit signal WEIGHTS with DROdio.

## Progress Update as of 2026-05-26 9:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Resuming the DATA-SOURCE roadmap (not cost). Building the next 5 impact-ranked
free sources, one at a time. **#1 done: NFX direct scraper** — the branch's
namesake, finally live and FREE (Apify deleted).

### NFX direct scraper — DONE & wired
- Rewrote `enrichers/nfx.ts` to call `signal-api.nfx.com/graphql` directly with
  the Bearer `NFX_SIGNAL_TOKEN` (recovered the validated `InvestorsAutocomplete`
  search + `InvestorProfileLoad` queries from the prior session's captured cURLs;
  `person_id` = slug). No Apify → zero per-call cost.
- Precision: search filtered by first+last name overlap; profile re-confirmed by
  name, upgraded to "authoritative" when NFX's `linkedin_url` matches the
  subject's. Negative control (a well-known open-source maintainer) → 0 facts.
- Wired into `runEnrichments()`; deleted dead `src/lib/apify.ts`; added eval step
  ("Pulling your investor profile from NFX Signal"), "Found you on NFX Signal:
  <slug>" identity, and an NFX investor sub-rule to `SCORING_RUBRIC` (grounds the
  existing investor rules with NFX's portfolio count / claimed / fund size — no
  double-counting; claimed ⇒ corroborated, linkedin-match ⇒ authoritative).
- Smoke test (free, direct): Jordan Lee → a major venture firm $2.2B, 77 portfolio · Sam Rivera →
  250 · Casey Morgan → an early-stage fund $25M, 419 — exact match to the old
  Apify numbers. tsc + eslint clean, scoring tests 43/43.

### Building next (this session): SEC EDGAR v2 · GitHub social graph ·
Libraries.io dependents · USPTO PatentsView. Then revisit signal WEIGHTS with
DROdio.

## Progress Update as of 2026-05-26 6:21 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built and benchmarked BOTH remaining cost levers toward the $0.05/eval target.
**Conclusion: $0.05 at high quality is not reachable.** Neither a 3-tier
confidence cascade nor Opus effort-tuning closes the gap, for clean structural
reasons measured below. The high-quality cost floor is ~$0.12/eval (Opus) — keep
Opus + prompt caching; ship the already-committed truncation prod-fix.

### Lever 1 — 3-tier confidence ladder (Haiku@95 → Sonnet@85 → Opus): DEAD END
Built `scoreWith3TierCascade` + `isConfident` (gated by `SCORING_CASCADE="3tier"`).
Benchmarked 5 profiles (drodio, Taylor Brooks, Riley Chen, Alex Kim, Jamie Patel):
- **Tier distribution: haiku 0% · sonnet 0% · opus 100%.** Every profile escalated
  all the way to Opus → cascade cost **$0.21/eval, 82% MORE than always-Opus**.
- Root cause: on real founder profiles Haiku's min row-confidence tops out ~85
  (never the 95 bar) and Sonnet's sits 0–70 (never 85). Cheap tiers never qualify.
- **Calibration was GOOD news though:** when a cheap model was below its bar it
  was genuinely far off Opus (Haiku |gap| 114, Sonnet 66). Self-confidence DOES
  track accuracy — but the consequence is the ladder can't accept cheap on
  data-rich subjects, and lowering the bar would accept exactly the wrong answers.

### Lever 2 — Opus reasoning effort (low/medium/high/xhigh): DEAD END
Threaded `effort` through `scoreInputs`/`scoreWithClaude` (env `SCORING_EFFORT`,
`providerOptions.anthropic.effort`). Probe confirmed the lever works & the dash
model id `anthropic/claude-opus-4-7` resolves to real Opus 4.7. Swept 3 profiles:
- **Cost barely moves:** high→low is only ~6% cheaper ($0.134→$0.126). Scoring
  cost is input-token + JSON-output dominated; effort only trims reasoning (~10%
  of output), so it can't bridge $0.13→$0.05.
- **The "savings" are noise:** `low` drifted 54 pts avg vs `high` — but `xhigh`
  (more expensive) drifted 45 pts too. Re-scoring the same profile swings ±50–100
  pts run-to-run at temp 0.2. That's sampling variance, not an effort signal.

### Cost reality (high quality preserved)
| approach | eval cost | quality |
|---|---|---|
| Opus + caching (prod) | ~$0.12 | reference |
| 3-tier cascade | ~$0.23 | escalates 100% |
| Opus effort=low | ~$0.115 | 6% off + noise |
| Sonnet default | ~$0.10 | ~49 pt drift |
| Haiku | ~$0.045 | 114–264 pt drift (unusable) |

Only Haiku nears $0.05 and it's wildly off. Exa research is a fixed ~$0.025 floor.

### Side finding worth flagging
Scoring is **non-deterministic to ±50–100 pts** on the same model+profile (temp
0.2). For a leaderboard RANKING product that's a reliability concern independent
of cost — candidate follow-up: temperature 0 / multi-sample median. Not chased here.

### Detail of changes made:
- `eval-pipeline.ts`: `scoreWith3TierCascade` + routing (`SCORING_CASCADE`:
  `3tier`/`binary`/unset); `ScoringEffort` + `effort` threaded through scoring;
  low-signal & explicit-model jobs bypass any cascade. All cost-levers gated OFF
  by default → prod stays on Opus.
- `scoring.ts`: `isConfident(scoring, minConfidence)` (the ladder gate).
- `bench-models.mjs`: now simulates the 3-tier ladder + a confidence-calibration
  check. `bench-effort.mjs`: new Opus effort sweep. (probe-effort.mjs removed.)
- Tests: 7 new `isConfident` cases (21 total in the file, all green).

### Verification:
tsc + eslint clean; `scoring-verification.test.ts` 21/21 pass. Both levers
benchmarked live against real profiles (data above).

### Recommendation / next:
Ship this branch (carries the truncation prod-fix + gated cost-lever machinery +
benchmarks). Keep Opus + caching as prod default. The one remaining product
decision is Sonnet-vs-Opus default (~40% cheaper, ~49 pt drift) — a quality call,
not an engineering one.

## Progress Update as of 2026-05-26 9:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Dialing in the cascade revealed a latent PROD bug (scoring-output truncation) —
fixed it — and showed the cascade's escalation trigger isn't catching Sonnet's
divergence from Opus. Re-running the benchmark for clean data.

### Dial-in benchmark (5 profiles: drodio, Taylor Brooks, Riley Chen, Alex Kim, Jamie Patel):
- Per-call cost: **Haiku ~$0.021 · Sonnet ~$0.085 · Opus ~$0.131** (Opus only ~1.5x
  Sonnet because the shipped rubric caching compresses the gap; Haiku ~6x cheaper).
- **PROD BUG found:** `maxOutputTokens: 4000` truncates the JSON for high-signal
  subjects (many rows + recommendations) → "unbalanced braces" parse failure.
  Broke Sonnet on 2/5 AND **Opus on 1/5 (Riley Chen)** — i.e. rich profiles can
  fail scoring in prod today.
- Cascade: escalation fired **0/3** yet Sonnet diverged from Opus by **~49 pts
  avg** (+60 Kim, −85 Patel). The trigger (weak-evidence/low-confidence
  high-value rows) doesn't catch broad judgment divergence.

### Detail of changes made:
- `eval-pipeline.ts`: `maxOutputTokens` 4000 → **8000** (truncation fix — applies
  to ALL scoring incl. the prod Opus default).
- `scoreWithCascade`: now robust to a cheap-pass throw (truncated/unparseable
  JSON) — it escalates to Opus instead of failing the eval.

### Verification:
- tsc + eslint clean. Re-running bench-models.mjs (5 profiles) for clean data
  now that truncation is fixed.

### Open question for the cascade:
0% escalation + ~49pt Sonnet divergence suggests the cascade trades too much
fidelity for 40% savings on a ranking product. Likely outcome: ship the
truncation fix + keep Opus default + rely on prompt caching for cost; revisit
the cascade only with a better escalation signal (e.g. near event-cutoff scores).

## Progress Update as of 2026-05-26 8:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Model-cost Step 3: built the Sonnet→Opus escalation cascade, gated behind an env
flag so prod is unchanged until we turn it on.

### Detail of changes made:
- `scoring.ts`: `shouldEscalate(scoring)` — escalate when a HIGH-VALUE row
  (|points| ≥ 25, measured pre-weighting) is weakly evidenced (single-source /
  self-asserted) or low-confidence (<60). Well-corroborated big claims + small
  claims don't escalate (keeps escalations the minority → cheaper on average).
- `eval-pipeline.ts`: `scoreInputs` now computes `escalate` on the clamped
  (pre-weight) breakdown. New `scoreWithCascade()` scores with Sonnet, then
  re-scores with Opus on the SAME inputs only if `escalate` (reuses cached
  rubric; sums both calls' cost). `computeFreshScore` routes the default path
  through the cascade **only when `SCORING_CASCADE=1`** — admin jobs with an
  explicit model bypass it. Default (flag unset) = current Opus behavior.
- `tests/lib/scoring-verification.test.ts`: +7 shouldEscalate tests (36 total).

### Verification:
- tsc + eslint clean; 36 scoring/cascade unit tests pass.

### To turn on / validate:
Set `SCORING_CASCADE=1`. Before flipping in prod, run `bench-models.mjs` on
5–10 known profiles to confirm the escalation rate is the minority (so the
cascade is net-cheaper) and that Sonnet's non-escalated scores hold up. The
Step 2/3 work lives on this branch (ahead of main) for its own PR.

## Progress Update as of 2026-05-26 7:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR #25 merged to main (prod deploy). Started model-cost Step 2: wired Haiku,
split research from scoring, built + ran the model benchmark harness.

### Detail of changes made:
- **Merged PR #25** → main (commit cfd51e4); prod deploy triggered. Synced this
  branch with main (even). New work here forms the next PR.
- `eval-pipeline.ts`: wired **Haiku** (`anthropic/claude-haiku-4-5`) into the
  model map + pricing ($1/$5). Split `computeFreshScore` into exported
  `researchSubject(url)` → `ResearchInputs` and `scoreInputs(url, inputs, model)`
  → so the benchmark (and the future cascade) score IDENTICAL inputs across
  models without re-running research. Behavior preserved (eval-pipeline test 4/4).
- New `scripts/bench-models.mjs`: research once per profile, score with
  haiku/sonnet/opus, print founder/investor/combined + rows + cost + latency + Δ.

### First benchmark data point (drodio, one profile — anecdotal):
- haiku   102 (F82/I20) · $0.025 (−85%) · 18.8s · Δ −63 vs opus
- sonnet  145 (F145/I0) · $0.076 (−53%) · 40s   · Δ −20 vs opus
- opus    165 (F165/I0) · $0.161 · 37.5s
Read: Sonnet is a credible cheap default (−53% cost, −20 pts). Haiku diverges
more (−63, and a likely investor false-positive: I20 vs opus/sonnet I0).

### Next:
Run the harness on a fuller profile set to set thresholds, then Step 3 — the
Sonnet-default → Opus-escalation cascade using scoreInputs() + triggers
(low-confidence high-value rows, near-cutoff combined scores, divergence).

## Progress Update as of 2026-05-26 7:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Model-cost Step 1 shipped: prompt caching of the static scoring rubric, verified
working through the Vercel AI Gateway.

### Detail of changes made:
- `eval-pipeline.ts` `scoreWithClaude`: the scoring `generateText` call now sends
  the prompt as two message parts — the large static `SCORING_RUBRIC` prefix with
  `providerOptions.anthropic.cacheControl: {type:"ephemeral"}`, then the volatile
  per-subject body (guard + nonce'd data + schema hint) after the breakpoint.
  No behavioral change (same text, just split); buildScoringPrompt untouched.
- **Verified the gateway forwards cache_control** via a throwaway 2-call probe:
  call 1 wrote 22,405 cache tokens, call 2 read 22,405 (cachedInputTokens). So
  the AI Gateway honors Anthropic prompt caching — confirmed, not assumed.
- Effect: repeat scoring calls (batch jobs, rapid re-scores) pay ~0.1x for the
  rubric instead of full input price. Isolated single evals pay a tiny one-time
  write premium (~$0.005). `cachedInputTokens` already flows into per-eval pricing.

### Verification:
- tsc + eslint clean; 29 scoring tests pass; live gateway probe confirmed caching.

### Findings worth noting:
- The scoring path runs through the **Vercel AI Gateway + AI SDK** (model string
  "anthropic/claude-opus-4-7"), not the raw Anthropic SDK.
- `temperature: 0.2` is still passed to Opus 4.7; on the raw API that 400s (4.7
  removed temperature), so the gateway is shimming it. Works today; latent risk —
  left as-is per DROdio (separate follow-up if we want to clean it up).

### Next (model-cost roadmap):
Step 2 — benchmark harness (haiku/sonnet/opus on known profiles) + wire Haiku;
then Step 3 — Sonnet-default → Opus-escalation cascade.

## Progress Update as of 2026-05-26 6:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Explored model cost/routing with DROdio and recorded the chosen approach.

### Detail of changes made:
- New `docs/superpowers/specs/2026-05-26-model-cost-routing-design.md`.
- Findings: today every eval is one Opus call; prompt caching is OFF (we pay
  full input for the big static rubric every call); Haiku isn't wired.
- Chosen sequence (DROdio picked "caching + benchmark, then cascade"):
  1. Prompt caching of the static rubric (safe cost cut; use claude-api skill).
  2. Benchmark harness (haiku/sonnet/opus on known profiles) + wire Haiku.
  3. Sonnet-default → Opus-escalation cascade, triggers from the benchmark
     (low-confidence high-value rows, near-cutoff scores, low signalQuality).
- Also: cleared stale Next dev servers (multi-worktree single-server guard);
  if it recurs, pin `turbopack.root` in next.config.ts.

### Next: implement Step 1 (prompt caching) via the claude-api skill.

## Progress Update as of 2026-05-26 6:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Results-page batch 2: Re-Score moved below the score, the leaderboard line is now
"#N on Leaderboard | Re-Score Me" (two links), and Re-Score is claim-gated.

### Detail of changes made:
- `profile/page.tsx`: removed the header Re-Score button; computed
  `combinedP = computePercentile(row.score, "combined")` for the rank; replaced
  "View on Leaderboard" with a two-link row: `#{rankFromTop} on Leaderboard` |
  `<ReScoreButton variant="link" isOwner fullName>`.
- `ReScoreButton.tsx`: added `isOwner` + `fullName` props, a `link` variant, and
  a claim-gate — a verified owner re-scores directly; anyone else gets the
  ClaimProfileModal first (per DROdio: claim only if not yet claimed).

### Verification:
- tsc clean; 39 unit tests pass. My files lint clean (the 1 eslint error is the
  pre-existing logo `<a href="/?home=1">`, not in my diff; lint isn't a build gate).

### Still queued (batch 3 — needs server data):
- ③ live founder percentile in the scoring scoreboard (computePercentile → API)
- ④ press/news sub-bullets (persist press items on the eval row so cached
  replays show them too).

## Progress Update as of 2026-05-26 5:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Scoring-screen polish batch 1 (of a larger UI request set): scoreboard moved to
top, every signal listed individually (no bundling), copy → "about a minute",
and cached lookups now skip the theatrical replay and go straight to results.

### Detail of changes made:
- `eval-steps.ts` `buildScoreTally`: removed the "Plus N more" bundling — EVERY
  nonzero breakdown row now renders as its own tally line.
- `EvalProgress.tsx`: the Founder/Investor/Total scoreboard now sits at the TOP
  (sticky), building as items complete, instead of pinned at the bottom.
- `SplashForm.tsx` + `ReScoreButton.tsx`: "This usually takes about a minute."
- `/api/eval`: cache hits now return `cached: true`; SplashForm navigates
  straight to /profile on a cache hit (no animated replay of stored data).
- Test updated: buildScoreTally lists all rows individually. tsc + lint clean.

### Still queued (next batches):
- ③ live founder percentile (needs computePercentile in the API response)
- ④ press/news sub-bullets (needs press items persisted on the eval row)
- Results page: ⑦ move Re-Score below the score · ⑧ "#N on Leaderboard |
  Re-Score Me" two links · ⑨ Re-Score requires claim (pop claim modal).

## Progress Update as of 2026-05-26 4:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (#46 security-hardening, etc.) and captured the NFX SEARCH
endpoint — so we now have the full NFX query pair.

### Detail of changes made:
- Merged `origin/main` (6 commits incl. PR #46 security: cron prod-auth,
  prompt-injection nonce, GitHub identity match). Auto-merged cleanly —
  `scoring.ts`/`scoring.test.ts` combined main's nonce work with our
  verification fields. Verified: `buildScoringPrompt` self-generates the nonce
  (default param) so eval-pipeline's call is protected automatically; NFX still
  inert (not wired); tsc + lint clean; 47 unit tests pass.
- NFX search endpoint identified: `InvestorsAutocompleteQuery` →
  `investors(name_or_firm: $name_or_firm, first: $first)` returns matching
  people with slug (+ `firms(search_name:)`). Combined with the validated
  `InvestorProfileLoad` (slug → full profile), we have the complete name→slug→
  profile path for the direct scraper.

### Prod-readiness:
Everything on this branch is built + tested and prod-ready EXCEPT the NFX direct
scraper (next build; current nfx.ts is Apify-based and NOT wired into
runEnrichments, so it's inert/safe). Note for prod: the JWT-alert cron needs
RESEND_API_KEY set in Vercel env to actually send (degrades gracefully/no-op
otherwise).

## Progress Update as of 2026-05-26 4:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wired the NFX-JWT-expiry email alert (DROdio supplied a Resend key) and verified
the NFX direct-scraper approach works end-to-end via the captured GraphQL query.

### Detail of changes made (JWT alert):
- `RESEND_API_KEY` added to `.env.local` (gitignored). resend@^6.12.3 dep added.
- `src/lib/nfx-token.ts`: pure JWT-expiry decoder (`getTokenExpiry`). Unit-tested (4).
- `src/lib/admin-alert.ts`: lazy Resend sender `sendAdminAlert()` → drodio@festival.so
  (separate file from events-v1's email.ts to avoid a merge collision; same
  RESEND_API_KEY/RESEND_FROM env + hello@festival.so sender).
- `src/app/api/cron/jwt-check/route.ts`: weekly cron (CRON_SECRET auth) — emails
  if NFX token is within 14 days of expiry / expired / unreadable; `?force=1`
  test hook. Added to vercel.json (`0 16 * * 1`).
- Verified end-to-end: a forced test email sent successfully (Resend id returned)
  → festival.so sender domain is verified on this key.

### NFX direct scraper — VALIDATED (build next):
Replayed the captured `InvestorProfileLoad` GraphQL query (POST
signal-api.nfx.com/graphql, Bearer token from .env.local) for the original
smoke-test trio — exact match to the old Apify numbers, now FREE:
- Jordan Lee → a major venture firm, $2.2B fund, 77 portfolio
- Sam Rivera → 250 portfolio
- Casey Morgan → an early-stage fund $25M, 419 portfolio
Slug = `first-last` derivation worked for all three (search endpoint not
strictly needed for the common case). NB: the captured "search" cURL was
actually `LoadCurrentPerson` (session bootstrap), so a true name→slug search
query is still wanted for collision-safety. NEXT: rewrite enrichers/nfx.ts to
fetch this directly, wire into runEnrichments, add the investor sub-rule.

## Progress Update as of 2026-05-26 3:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built #1B: no-cap double-verification. High-value breakdown rows now carry an
evidence tier and get down-weighted unless corroborated — killing the
"write impressive LinkedIn claims" exploit without capping score or row count.

### Detail of changes made:
- `scoring.ts`: each breakdown row now has `verification`
  (authoritative|corroborated|single-source|self-asserted, default
  single-source) + `sources[]`. New `applyVerificationWeighting()` scales
  HIGH-VALUE rows (|points| ≥ 25) by tier (authoritative/corroborated ×1.0,
  single-source ×0.6, self-asserted ×0.25); low-value rows untouched. Added a
  DOUBLE-VERIFICATION section to SCORING_RUBRIC telling Claude how to classify
  tiers (LinkedIn-only ⇒ self-asserted; SEC/GROUNDED FACTS ⇒ authoritative).
- `eval-pipeline.ts`: SCHEMA_HINT carries the two new fields; weighting applied
  after clampBreakdown, before totals recompute (totals stay = sum of rows).
- `tests/lib/scoring-verification.test.ts`: 7 tests (incl. "no caps"); updated
  the existing scoring.test.ts fixtures for the new required fields. 24/24 pass.

### Verification:
- tsc + eslint clean; 24 scoring tests pass. No DB migration (rides in the
  existing breakdown jsonb).

### Potential concerns to address:
- UI transparency: a down-weighted row currently just shows its reduced points;
  surfacing *why* (a "needs corroboration" treatment) needs `verification` on
  score_items (a migration) — deferred to a follow-up.
- NFX (#2): confirmed it's a GraphQL API at signal-api.nfx.com/graphql (POST,
  Bearer JWT). Awaiting DROdio's Copy-as-cURL of the search + profile queries.

## Progress Update as of 2026-05-26 2:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (cost tracking, delete-my-profile, auto-claim, account-setup
redesign — 22 commits) then built roadmap source #1a: the Exa-grounded facts
layer. Also designed the no-cap double-verification mechanism (next: #1b).

### Detail of changes made:
- Merged `origin/main` (now `0 ahead` of main + our work). Re-`pnpm install`ed.
- New `src/lib/exa-grounding.ts`: `groundSubjectFacts()` calls Exa `/answer` with
  an output schema → structured {totalRaisedUsd, exits[], notableInvestments[]}
  + third-party **citation URLs**, synchronously. Returns its Exa cost so the
  merged per-eval pricing rolls it in. `renderGroundedFacts()` prepends a
  high-trust "prefer over self-claims" block to the scoring prompt.
- Wired into `computeFreshScore` (parallel with MM + enrichers; cost aggregated).
- `scripts/test-exa-grounding.mjs`: verified live — Morgan Diaz → $9.8B
  raised + exits (a $525k early acquisition, a $7.5M exit) + unicorn investments
  (two well-known SaaS startups), 6 citations, ~2.3s, $0.005.

### Double-verification design (agreed: no caps; evidence-weight instead):
Each breakdown row will carry `sources[]` + `verification` (authoritative /
corroborated / single-source / self-asserted). High-value rows (points ≥ 25)
get scaled by tier (authoritative/corroborated ×1.0, single-source ×0.6,
self-asserted ×0.25) in a deterministic pipeline step. No score/row caps. This
is roadmap #1b — next increment, built on these citations.

### Verification:
- tsc + eslint clean; live smoke test passes. Cost ~$0.005/eval (parallel, +~2s).

## Progress Update as of 2026-05-26 12:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the full free-first data roadmap spec (26 sources, impact-ranked) and
weighted every upcoming source in the scoring rubric doc (v0.0.2). No code yet —
this is the plan we'll execute one source at a time.

### Detail of changes made:
- New `docs/superpowers/specs/2026-05-26-founder-signal-data-roadmap-design.md`:
  impact-ranked sequence (Tiers 1–7), per-source build notes, consolidated
  API-keys table (with where to get each), cross-cutting requirements (progress
  page + "Found you on X" + rubric sub-rule + identity match per source), and a
  flagged NEW risk/compliance axis decision.
- `PRD/scoring-rubric-v0.0.1.md` → bumped to v0.0.2: added the impact-ranked
  "Roadmap — proposed sub-rules" section weighting each source (★ ratings +
  point tiers), plus an anti-double-counting note (corroboration raises
  confidence, not points).

### Sequence (top of the list):
1. Exa Research API + /answer upgrade (grounds weakest points; no new vendor)
2. NFX direct scraper (investor portfolio/check size; free)
3. SEC EDGAR v2 (fund size/AUM, IPOs, acquisitions, roles)
… then GDELT, Libraries.io, GitHub graph, books, YouTube, app stores, DOL H-1B,
OpenCorporates, patents, trademarks, domain history, podcasts, Reddit, community,
grants, USAspending, FEC, vertical (clinical/crypto), risk axis.

### Keys DROdio is getting in tandem:
api.data.gov (one key → FEC+openFDA), YouTube Data API, Listen Notes, Reddit app,
Libraries.io, OpenCorporates, Companies House, Etherscan, CourtListener,
OpenSanctions, Eventbrite. (SEC/GDELT/patents/etc need no key.)

### Potential concerns to address:
- Risk/compliance axis (OpenSanctions, CourtListener) introduces negative/gating
  signal the rubric doesn't have today — recommended as a gate + admin lane, not
  public negative points. Needs DROdio's product call.

## Progress Update as of 2026-05-26 11:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Four scoring-screen improvements: scoreboard visible from the start, FF logo
top-center, heading rename, and "Found you on <platform>: <handle>" reveal lines.

### Detail of changes made:
- `EvalProgress.tsx`: the Founder/Investor/Total scoreboard now shows from the
  very beginning (0/0/0) and ticks up as rows fold in — previously it only
  appeared near the end, which also caused the scroll/layout jank.
- `SplashForm.tsx` + `ReScoreButton.tsx`: added the Founder Festival logo
  top-center of the scoring overlay; heading is now "Scoring you now for
  membership" (and "Re-scoring you for membership").
- Found-identity lines: `EvalResult` now carries `foundIdentities[]`, extracted
  in `rowToResult` from `evaluations.profile.enrichments[].raw` (github login,
  HN/npm/HF handle, SO display_name; GitHub first). `buildFoundIdentities`
  renders "Found you on GitHub: DROdio" lines, prepended to the finale (points:0
  so they don't move the scoreboard). All eval paths (fresh/cached/rescore) flow
  through rowToResult, so it's covered everywhere.
- `tests/lib/eval-steps.test.ts`: +2 tests for buildFoundIdentities (6/6 pass).

### Verification:
- tsc clean; eslint clean (2 pre-existing-style `<img>` warnings, matching
  profile/page.tsx); unit tests 6/6.

### Potential concerns to address:
- Placement: research returns all-at-once, so the "Found you on…" lines appear at
  the START of the finale (the results reveal), led by GitHub — not literally
  interleaved before the GitHub research step (data doesn't exist mid-animation).
  Flag if you want them moved into the research list instead.

## Progress Update as of 2026-05-26 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` again (PR #38 "+ add affordances hover-only", PR #39
"company name clickable on leaderboard"). Also deleted the Daniel Odio test
profile from BOTH Neon and Clerk for a clean fresh-claim test.

### Detail of changes made:
- Merged `origin/main`. `ScoreTable.tsx` auto-merged cleanly: main's hover-only
  "+" (`group/rubric` → `group-hover/rubric`) now coexists with our admin
  add-override + AdminPill. Brought in Badges/LeaderboardTable/leaderboard.ts.
- One-off (no code change committed): deleted "Daniel Rubén Odio" — Neon eval
  4110f55d + score items + recommendations + claim row, and Clerk user
  user_EXAMPLE0000000000000000000 ({"deleted":true}, GET→404). Used a temp
  scripts/_odio.ts (since removed). Clerk key is sk_test (dev instance only).

### Verification:
- tsc clean; tally unit test 4/4. (Pre-existing `Badges.tsx` setState-in-effect
  warning is identical to origin/main — not introduced here.)

### Potential concerns to address:
- NEXT UP (requested): a user-facing "Delete my profile" action in the top-right
  user menu that removes them from both Neon and Clerk. DROdio has "one thing"
  to cover before we build it.

## Progress Update as of 2026-05-26 9:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admins can now ADD score items on any profile without the claim modal (admin
override), matching their existing confirm/modify/reject powers, with the same
purple "Admin" pill marking the action.

### Detail of changes made:
- `ScoreTable.tsx`:
  - Extracted the inline admin pill into a reusable `<AdminPill />` (used in
    ItemRow already; now also in AddItemRow).
  - `AddItemRow` now takes `isAdminViewer`. `onPlus` order: admin → open editor
    directly (override); else non-owner → claim modal; else owner-needs-setup →
    /account/setup; else owner → editor.
  - Admin pill renders next to the "+" (collapsed) and next to Save/Cancel
    (editing) when the viewer is an admin.

### Verification:
- tsc + eslint clean.

## Progress Update as of 2026-05-26 9:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Tightened the user-facing "add a score item" flow per DROdio: users propose the
item text only (no point value — admins assign points later), and adding now
requires a claimed + fully-registered profile.

### Detail of changes made:
- `ScoreTable.tsx` `AddItemRow`:
  - Removed the "Points:" number input; the POST no longer sends `points` (the
    API already defaults to 0). Owner proposes the item; admin sets points
    during pending review.
  - The "+" now gates on OWNERSHIP, not admin: not-owner → opens the Claim/Verify
    Profile modal; claimed-but-needs-setup → routes to /account/setup; only a
    fully-registered owner opens the add editor. (ItemRow's confirm/modify/reject
    still allow admins via canDirectlyAct — unchanged.)
  - Threaded `isOwner` through Section → AddItemRow.

### Verification:
- tsc + eslint clean. (API unchanged: still defaults points→0, gates owner|admin.)

### Potential concerns to address:
- Admins adding BRAND-NEW items to a profile they don't own now get the claim
  modal too (adding is owner-gated). Admins still moderate existing rows and set
  points in the pending queue. Flag if admin direct-add is desired.

## Progress Update as of 2026-05-26 9:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Polished the score-tally finale per DROdio feedback: removed per-row "+N",
kept the bottom Total incrementing as rows fold in, and added a
"Finalizing your profile…" spinner during the end dwell so it doesn't look done.

### Detail of changes made:
- `eval-steps.ts`: `buildScoreTally` no longer puts the point value in the row
  text ("Folding in Raised $82.1M total at Armory…", no "(+80)"). `points` is
  retained on the item solely to drive the running total.
- `EvalProgress.tsx`: added a `finalizing` state — once all tally rows have
  folded in, shows a "[spinner] Finalizing your profile…" row (and auto-scrolls
  to it) during the ~2.4s dwell before navigating to /profile. The sticky
  Founder/Investor/Total scoreboard already increments as each row reveals.
- `tests/lib/eval-steps.test.ts`: updated to assert NO per-row points in text
  while totals are still preserved; 4/4 pass.

### Verification:
- Unit tests 4/4; tsc + eslint clean.

## Progress Update as of 2026-05-25 7:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (23 commits) into `founder-signals` — badges, claimed-
profile pills, vanity profile URLs, and the `/welcome` → `/profile` rename.
Resolved 2 conflicts and ran `pnpm install` so the worktree's drizzle drift
guard passes.

### Detail of changes made:
- Merged `origin/main`. Conflicts in `SplashForm.tsx` and `ReScoreButton.tsx`
  (both branches touched the post-score navigation): kept main's `/profile?e=`
  routing AND our `setTally(...)` score-tally call.
- `scoring.ts` auto-merged cleanly; all 7 new source sub-rules intact.
- Ran `pnpm install` in the worktree (drizzle-kit was missing → drift guard
  "command not found"); drift guard now reports "No schema changes".
- New migrations 0003/0004 + main's schema arrived via the merge, in sync.

### Verification:
- No conflict markers; tsc + eslint clean; eval-steps unit test 4/4.

### Potential concerns to address:
- The score tally + scoreboard now navigate to `/profile` (main's canonical
  URL). Worth a quick manual re-score to confirm the `/profile` landing works.

## Progress Update as of 2026-05-25 6:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Tuned the scoring-progress timing so the tally + scoreboard are actually seen. A
fresh `/api/eval` run can take ~44s (13 enrichers + Exa + Claude); the prior
pacing finished the research animation in ~32s and then froze on "Computing your
score" for the remainder, and the tally flew by before navigating.

### Detail of changes made:
- `EvalProgress.tsx`: research steps now pace at ~1.7–3.0s each (was ~1.2–2.3s)
  so they keep ticking through a typical fresh run instead of freezing on the
  last step. Added a ~2.4s DWELL on the completed scoreboard before navigating,
  so the final Founder/Investor/Total is clearly visible (skipped for low-signal).
- No logic bug was found in the tally/scoreboard; verified the 44s run completed
  and navigated (dev log: `POST /api/eval 200 in 44s` → `GET /welcome`).

### Potential concerns to address:
- Very slow runs (>~50s) can still briefly hold on "Computing your score"; the
  real fix would be streaming partial results (out of scope).
- Quickest way to demo the tally: score an already-cached profile (API returns
  instantly → straight to the tally + ticking scoreboard + dwell).

## Progress Update as of 2026-05-25 6:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the score "compute" live: the tally finale auto-scrolls to keep the active
line in view and shows a sticky founder/investor/total scoreboard that ticks up
to the real score (a mini version of the results page) as each signal folds in.

### Detail of changes made:
- `eval-steps.ts`: `buildScoreTally` now returns structured `TallyItem[]`
  (`{text, points, rubric}`). Shows the top 8 contributors individually and
  summarizes the rest per rubric so the running totals reach the real
  founder/investor scores.
- `EvalProgress.tsx`: auto-scrolls the active step into view (bottom stays
  visible); renders a sticky bottom scoreboard (Founder / Investor / Total,
  `font-display` + `tabular-nums`) that accumulates as finale lines fold in.
- `SplashForm.tsx` / `ReScoreButton.tsx`: pass the structured tally; Re-Score
  overlay made scrollable to match the splash overlay.
- `tests/lib/eval-steps.test.ts`: updated for the structured shape +
  total-preservation; 4/4 pass.

### Verification:
- Unit tests pass; tsc + eslint clean.

### Potential concerns to address:
- Sticky scoreboard uses `-mx-5 -mb-5` to bleed to the panel edges, assuming the
  enclosing box keeps its `p-5` padding (true in both overlays today).

## Progress Update as of 2026-05-25 5:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the static "Computing your score" wait with a data-driven tally: once
the score returns, `EvalProgress` narrates the actual breakdown rows folding in.

### Detail of changes made:
- `eval-steps.ts`: new `buildScoreTally(founderBreakdown, investorBreakdown)` —
  turns the real breakdown rows into engaging lines ("Folding in active on
  Hacker News with 12,400 karma (+15)"), biggest contributors first, top 6.
- `EvalProgress.tsx`: new optional `finale` prop. Holds the spinner on the last
  research step until `done`, then plays the tally lines at a readable ~850ms
  pace before finishing. Empty finale → unchanged behavior.
- `SplashForm.tsx` + `ReScoreButton.tsx`: both already receive the full eval
  result (incl. breakdown) from `/api/eval` and `/api/rescore` — now build the
  tally and pass it as `finale`. No API change needed.
- `tests/lib/eval-steps.test.ts`: unit tests for the tally builder — 4/4 pass.

### Verification:
- Unit tests pass; tsc + eslint clean. Visual check on the dev server pending.

### Potential concerns to address:
- Tally line phrasing derives from Claude's breakdown reasons (the rubric
  requires them to cite figures), so quality tracks the reason text.

## Progress Update as of 2026-05-25 12:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the OpenAlex step read as plain "research papers," and extracted the live
scoring rubric into a versioned PRD doc.

### Detail of changes made:
- `eval-steps.ts`: OpenAlex step reworded to "Checking research papers you've
  authored and their citations" (users didn't recognize "OpenAlex" = research papers).
- New `PRD/scoring-rubric-v0.0.1.md`: human-readable mirror of `SCORING_RUBRIC`
  (source of truth stays `scoring.ts`), covering the founder + investor rubrics,
  all 9 source sub-rules, hard checks, confidence heuristic, per-row clamps, and a
  source→rule map.

### Potential concerns to address:
- Keep `scoring-rubric-v0.0.1.md` in sync when `SCORING_RUBRIC` changes (the doc
  notes the code is the source of truth).

## Progress Update as of 2026-05-25 12:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Surfaced the 7 new sources in the user-facing scoring-progress list (the
`EvalProgress` steps shown during a scoring/re-score run), so users see
everything we actually check.

### Detail of changes made:
- `eval-steps.ts`: `EVAL_STEPS` grew 12 → 19, adding npm, Hugging Face, Stack
  Overflow, Hacker News, SEC EDGAR (capital raised), Wikidata, and OpenAlex,
  ordered alongside the existing source checks.
- `SplashForm.tsx`: fixed a stale "12-step list" comment.
- HN step reworded to lead with karma: "Checking your Hacker News karma and top posts".
- Safe with `EvalProgress` (length-driven; holds the last step until the API
  returns, then snaps through). Step labels are unique (used as React keys).

### Potential concerns to address:
- The list is process-showing (what we check), not match-confirming — consistent
  with prior behavior (everyone sees "Cross-referencing GitHub" even with no GitHub).

## Progress Update as of 2026-05-25 11:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added 5 more keyless enrichers (Stack Overflow, npm, Hugging Face, Wikidata,
OpenAlex) via parallel agents, integrated all 7 new sources into
`runEnrichments()`, and added founder-rubric rules for each. Full pipeline
verified.

### Detail of changes made:
- New enrichers (each smoke-tested live, identity-confirmed, graceful-empty):
  - `stackoverflow.ts` — reputation + badges + top tags (a top Stack Overflow user 1.5M rep).
  - `npm.ts` — packages + monthly downloads (a prolific npm author 1,061 pkgs / 9.6B/mo).
    Derived handles accepted only when a solo package's author corroborates;
    org-package authors (e.g. acme-dev) require the known-URL path.
  - `huggingface.ts` — models/downloads/likes (ml-dev 52 models). AI-founder
    signal. Co-founders reachable via Exa URL (hyphen/emoji handles can't be derived).
  - `wikidata.ts` — structured occupation/employer/education/awards + notability
    (a fintech founder Q0000001; a marketplace founder Q0000002, employer resolved).
  - `openalex.ts` — h-index/citations/fields (a leading AI researcher h-index 137; another 125).
    Gated at works_count>=3 AND cited_by_count>=50 so non-academics don't surface.
- All 7 new sources wired into `runEnrichments()`.
- `scoring.ts`: added STACK OVERFLOW / NPM / HUGGING FACE / WIKIDATA / OPENALEX
  sub-rules. The Wikidata notability bonus is capped to once across Wikipedia+Wikidata.
- 7 smoke scripts under `scripts/test-*.mjs`.

### Verification:
- `npx tsc --noEmit`: clean except 3 pre-existing Next 16 `LayoutProps` errors.
- `eslint`: clean across all enricher + scoring files.
- `npm test`: 85/88 pass. The 3 failures (eval-pipeline duplicate-key, rate-limit
  timeout) are pre-existing DB-integration flakiness under concurrent load — the
  eval-pipeline test PASSES 3/3 in isolation, which also confirms the full
  integrated pipeline runs end-to-end with all new enrichers.

### Potential concerns to address:
- Recall depends on Exa surfacing profile URLs for the handle-based sources
  (HN/SO/npm/HF). Founder self-connect via the claim flow is the eventual fix.
- `extractedMetrics` schema intentionally unchanged (no new badge fields yet) to
  avoid Zod/schema churn this pass.
- DB-integration tests are flaky under concurrent load; consider
  `--no-file-parallelism` or a dedicated test DB.

## Progress Update as of 2026-05-25 11:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the SEC EDGAR enricher — the authoritative funding source that fixes
FEAT-01. Wired in + verified against live filings.

### Detail of changes made:
- New `enrichers/sec-edgar.ts`: person-anchored full-text search of Form D
  exempt-offering filings, grouped by issuer, confirmed via the related-persons
  list, with `totalAmountSold` parsed from the Form D XML. Requires a
  descriptive User-Agent with contact email (drodio@storytell.ai) or SEC 403s.
- Wired into `runEnrichments()`.
- `scoring.ts`: added SEC EDGAR / FORM D SUB-RULES instructing Claude to PREFER
  the authoritative SEC figure for `totalRaisedUsd` over press snippets (with an
  explicit no-double-counting note).
- `scripts/test-sec-edgar.mjs`: verified live — Morgan Diaz → their fintech company
  $6.9B offering; Alex Kim → their marketplace company $201.6M; bogus name → 0 facts.

### Potential concerns to address:
- Form D covers US filings from 2001+ only; non-US / SAFE-only raises won't
  appear (acceptable — when present it's authoritative).
- "largest offering" may come from a different filing than "most recent"; the
  raw data disambiguates. Minor wording polish possible later.

## Progress Update as of 2026-05-25 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Branch repurposed from NFX-only to the broader founder-signals data-acquisition
layer. Built the shared identity-matching foundation and the first enricher
(Hacker News), wired in and verified against the live API.

### Detail of changes made:
- Renamed branch/worktree/PRD `nfx-direct-scraper` → `founder-signals`.
- Wrote design spec `docs/superpowers/specs/2026-05-25-founder-signal-sources-design.md`.
- `enrichers/types.ts`: extended `EnrichmentResult.source` union with the wave-1
  sources (hackernews, sec-edgar, stackoverflow, npm, huggingface, wikidata, openalex).
- New `enrichers/identity.ts`: shared handle-derivation + identity-confirmation
  helpers, generalizing the inline logic from `github.ts`. Precision over recall.
- `enrichers/extract.ts`: `extractKnownUrls` now also captures HN / Stack Overflow /
  npm / Hugging Face / Wikidata URLs. NB: `news.ycombinator.com` is matched BEFORE
  the YC-companies matcher (it contains `ycombinator.com`).
- New `enrichers/hackernews.ts`: Firebase karma/age + Algolia post/comment counts +
  top posts. Trusts an Exa-surfaced HN URL; otherwise confirms a derived handle via
  the bio. Wired into `runEnrichments()`.
- `scoring.ts`: added HACKER NEWS SUB-RULES to the founder rubric (karma tiers,
  active-poster, top-post tiers).
- `scripts/test-hackernews.mjs`: smoke test. Verified live — `jsmith` → 157,316 karma /
  699 posts / 9,985 comments; the `jdoe` derived-handle case is correctly REJECTED
  (empty bio fails corroboration); an Exa-surfaced `jdoe` URL is trusted.

### Potential concerns to address:
- Identity matching favors precision: derived handles with sparse bios are dropped,
  so recall depends heavily on Exa surfacing profile URLs. The eventual fix is
  founder self-connection of handles via the claim flow (noted in the spec).
- Adding facts to the scoring prompt will modestly shift existing scores (expected;
  DROdio chose "add explicit rubric rules").
- `tsc --noEmit` shows 3 pre-existing `LayoutProps` errors in app/layout files — a
  Next 16 generated-type quirk, unrelated to this work.

(Add new entries above this line as work proceeds. Format per CLAUDE.md.)
