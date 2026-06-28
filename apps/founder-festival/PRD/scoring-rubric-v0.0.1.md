# Scoring Rubric v0.0.25

**Status:** live rubric. Tier-1 data sources (Exa Research grounding, NFX Signal,
SEC EDGAR v2) are now shipped; the roadmap (last section) tracks what's left. As
of 2026-06-05.
**Source of truth:** `src/lib/scoring.ts` (`SCORING_RUBRIC` + the post-processing
helpers `clampBreakdown` / `applyVerificationWeighting`) and the scoring order in
`eval-pipeline.ts` (`scoreInputs`). This doc mirrors them for humans; if the two
ever disagree, the code wins — update this file to match.
**Changelog:**
- **2026-06-12 (NFX token: one-click refresh — no scoring change):** the `[nfx]` enricher
  now reads its JWT **DB-first** (`app_settings` key `nfx_signal_token`) via
  `getNfxToken()`, with the `NFX_SIGNAL_TOKEN` env var as the seed/fallback — so the
  token can be refreshed at runtime without a redeploy. A new admin page
  (`/admin/nfx-refresh`) provides a **bookmarklet**: clicked while logged into
  signal.nfx.com, it captures the live Bearer JWT from the app's own API calls and
  POSTs it to `/api/admin/nfx-token` (secret-authed, CORS-scoped to signal.nfx.com),
  which validates + stores it. Kills the DevTools hunt. The weekly `jwt-check` cron
  now checks the live token + links the page. No scoring-logic change.
- **2026-06-10 (NEW keyless sources: crates.io + Tranco):** two more keyless enrichers.
  (1) `[crates]` (`src/lib/crates-io.ts` + `enrichers/crates.ts`) — Rust OSS footprint
  (published crates + downloads). Identity is SAFE without name-guessing: crates.io
  logins ARE GitHub logins (OAuth), so it keys off the GitHub login already resolved
  and confirms the crates account's GitHub URL links back. CRATES.IO SUB-RULES: author
  +2 once; downloads 100k–999k → +3, 1M–9.9M → +6, 10M+ → +10 (FOUNDER; lower tiers
  than npm since the Rust ecosystem is smaller). (2) `[tranco]` (`src/lib/tranco.ts` +
  `enrichers/tranco.ts`) — independent domain-popularity rank that CROSS-CHECKS Majestic
  Million; keyed off candidate company domains. TRANCO SUB-RULES: domain-reach magnitude
  awarded AT MOST ONCE across MM + Tranco combined (corroboration, not a second award).
  Both wired into the waterfall (steps + HOST/PLATFORM maps). Live-verified (a top Rust crate author →
  85 crates / 9.3B downloads; stripe.com → Tranco #241). No point disclosure in facts.
- **2026-06-10 (no-op refactor — verified rubric accurate):** extracted the
  deterministic bonus helpers into `scoring-bonuses.ts` and the cost accounting into
  `scoring-cost.ts` (out of eval-pipeline.ts). Pure code-move — **no scoring/points/
  order change**; the same bonuses run in the same place (scoreInputs).
- **2026-06-10 (NEW source: Kaggle — data-science / ML credibility):** added a
  `[kaggle]` enricher (`src/lib/kaggle.ts` + `src/lib/enrichers/kaggle.ts`) using the
  Kaggle public API (Bearer `KAGGLE_API_TOKEN`, the newer `KGAT_…` format — no
  username/key pair needed). It measures the datasets + notebooks the subject has
  published and the community votes/downloads they earned — a peer-voted proxy for
  hands-on ML depth, complementary to `[github]` / `[huggingface]`. Identity is
  precision-first: a trusted `kaggle.com/<username>` profile URL Exa surfaced, else
  probe derived handles and accept ONLY when a returned item's creator/author name
  matches the subject (Kaggle has no public profile endpoint). New KAGGLE SUB-RULES:
  identified author +3 once; total upvotes 50–499 → +3, 500–4,999 → +8, 5,000+ → +15
  (FOUNDER rubric). Wired into the waterfall (new white-checkmark step + HOST/PLATFORM
  maps so findings nest under "Kaggle"). Live-verified on a real author. Token added
  to `.env.local` + Vercel (Prod + Dev; Preview pending a manual add — see PRD).
- **2026-06-10 (FIX: re-score preserves rated recommendations):** every re-score
  (`reEvaluate`) regenerated `recommendations.items` with fresh ids, orphaning the
  owner's `recommendation_responses` (their IRL-event ratings) — which then rendered
  on the wrong rows (the /sam-rivera bug). reEvaluate now PRESERVES the existing
  recommendations (keeping item ids stable) when the owner has already rated them;
  otherwise it takes the fresh run's recommendations as before. No point-logic change.
- **2026-06-10 (patent IDENTITY fix — no points change):** even after the coverage
  fix below, `/drodio` still found ZERO patents. Root cause: the enricher searches
  USPTO with the name `extractFullName` derives LIVE from the LinkedIn page — which
  for DROdio is his vanity DISPLAY name "DROdio" (a single token with no separable
  first/last), so the surname search + strict first+last filter could never match
  his Armory patents (filed as "Daniel Rubén Odio"). Fix: thread the eval row's
  prior LLM-extracted legal name into the enricher as `knownFullName`; the patents
  enricher (`resolvePatentName`) now searches with whichever of {live name, known
  name} actually parses into a first+last. Available on RE-scores (the row already
  has the legal name); first scores still use the live name. Live-verified: with the
  vanity handle alone → 0 patents; with "Daniel Rubén Odio" → 2 (1 granted, Armory).
  Same PATENTS scoring rule — only WHICH name is searched changed. Rescore-to-apply.
- **2026-06-10 (patent COVERAGE fix — no points change):** the `[patents]` enricher
  was finding ZERO patents for real inventors (Sam Rivera's 8 granted
  patents, DROdio's Armory patents) for two reasons: (1) corroboration only matched
  the subject's CURRENT company, but patents are assigned to PAST employers; (2) the
  USPTO search used the full name as a phrase, missing "Daniel R. Odio" (middle
  initial) / "Sam" vs "Samuel". Fix: search by SURNAME; re-filter with a strict
  first+last match (tolerant of middle initials / nicknames, `inventorIsSubject`);
  corroborate the assignee against the subject's WHOLE-career research text
  (LinkedIn + highlights), so past-employer patents count. Same PATENTS scoring
  rule (one technical-depth row scaled to count) — only WHICH patents are found
  changed. Live-verified: Sam Rivera → 13 (8 granted), DROdio → 2. Rescore-to-apply.
- **2026-06-10 (no-op refactor — verified rubric accurate):** consolidated HOST
  extraction into `src/lib/domain-normalize.ts` (`domainHost`); migrated the
  MM-bonus/badges/enricher domain-comparison sites to it. **No scoring/points/order
  change** — behavior-preserving for bare-domain inputs; only fixes cross-path
  hash drift that could miss a match.
- **2026-06-10 (investor profiles — surface angel-investment evidence):** prolific
  ANGELS (e.g. a famous chip-company CEO) were scoring 0 as investors because our investor
  signals are firm-centric (NFX/Neo = VC partners, SEC = fund GPs) and nothing
  surfaced their personal investments. Fix is Exa, not BrightData (no investor
  dataset exists). Strengthened `groundSubjectFacts`: the query now explicitly
  asks for EVERY startup the subject backed (angel/seed/rounds led, board/advisor
  seats) + their outcomes + the TOTAL portfolio count; new `portfolioCount` field
  (stated count, else the # enumerated) rendered into the GROUNDED FACTS block as
  "Investor portfolio: ~N companies". The investor rubric's existing "per active
  investment +1 (cap +50)" + portfolio-outcome rules (IPO +50 / acq +20/+5 /
  unicorn +30) now point AT this authoritative count + the cited
  "Investment: <co> (ipo/…)" lines, with an explicit "don't leave a real angel at
  0" instruction. Same Exa /answer call (no cost change). Rescore-to-apply.
- **2026-06-10 (no-op refactor — verified rubric accurate):** consolidated the
  `breakdown` JSONB parse (`{founder,investor}` vs legacy flat array) into the pure
  `src/lib/breakdown-rows.ts`; `eval-pipeline.ts` `rowToResult` reads through it
  instead of an inline branch. **No scoring/points/order change** — parse semantics
  identical (legacy array still = founder rows, investor empty).
- **2026-06-10 (new sources: USPTO patents + X/Twitter — no migration):** (a) the
  `[patents]` enricher (`enrichers/patents.ts` + `lib/uspto.ts`, USPTO Open Data
  Portal, `USPTO_API_KEY`, SYNCHRONOUS ~1s) — US patents naming the subject as an
  inventor = TECHNICAL/domain depth. **Identity-safe**: inventor-name match AND the
  patent's ASSIGNEE company contains one of the subject's own company tokens (a
  patent with no corroborating assignee is dropped), so same-named inventors don't
  attach. New PATENTS rubric block: one technical-depth row scaled to count,
  distinct from GitHub OSS. (b) the `[twitter]` async dataset (BrightData X Profiles
  `gd_lwxmeb2u1cniijd7t4`, in the bd_async registry) — the handle is the one the
  subject listed on their OWN LinkedIn bio links (self-asserted → exact identity, no
  same-name risk); facts = follower count → GTM/DISTRIBUTION. New X/TWITTER REACH
  rubric block (modest, don't double-count LinkedIn followers). Waterfall: 2 new
  white-checkmark steps (USPTO + X/Twitter) with host mappings. Live-verified
  (a famous chip-company CEO → company-corroborated patents). Rescore-to-apply.
- **2026-06-10 (FIX: credibility title was never emitted):** the `credibilityTitle`
  output (added with #316) was described in the rubric and accepted by the schema,
  but the `SCHEMA_HINT` output contract in `eval-pipeline.ts` (the authoritative
  "emit exactly these fields" TypeScript shape) omitted it — so the model never
  produced one and ~92% of high-signal profiles (276/299) had a NULL title. Added
  `credibilityTitle: string | null` to `SCHEMA_HINT`. No point-logic change; titles
  now populate on (re)score. Existing null-title profiles need a re-score to backfill.
- **2026-06-10 (BrightData ASYNC ENRICHMENT SUITE — generic registry + 3 datasets +
  num-id dedup):** generalized async BrightData enrichment into a **dataset registry**
  (`bd-datasets.ts`: per-dataset `resolveInput` / `corroborate` / `facts`) driven by
  `bd-async.ts`. A collection is too slow to block an eval, so: after scoring,
  `maybeTriggerBdAsync` queues collections for whichever datasets can resolve an
  input now (chained ones resolve once their dependency caches); the `bd-async-sweep`
  cron (every 3 min) polls, downloads ready+corroborated snapshots, caches the facts
  under `evaluations.bd_async[key]`, and re-scores so the model folds them in. The
  per-dataset enrichers only EMIT cached facts (instant; re-scores free); a
  terminal-empty marker stops re-triggering. **Datasets wired:** `[crunchbase]`
  company (funding/exits/employees/Semrush traffic/Apptopia downloads/investors,
  corroborated by domain-or-founder), `[linkedin-company]` (headcount/followers/
  funding — EXACT identity from the subject's own LinkedIn current_company.company_id
  → operator/distribution), `[crunchbase-person]` (board/advisor roles + press —
  EXACT identity, chained off the company's founders list → investor/operator). New
  rubric sections LINKEDIN COMPANY DATA + CRUNCHBASE PERSON DATA (modest, no
  double-count, no point disclosure). Waterfall: 3 new white-checkmark steps;
  Crunchbase findings nest under the Crunchbase step. **Dedup:** `runEval` also keys
  on `linkedin_num_id` (the strongest key, stable across vanity URLs — catches the
  duplicate-handle class directly). Migration 0049 adds `bd_async` jsonb +
  `linkedin_num_id`. Same-domain/exact-identity corroboration keeps mis-attribution
  out. Glassdoor/G2/app-stores are now one registry entry away (input resolution
  pending); patents = the separate USPTO API (key already provisioned). Cost:
  ~$0.0025/record + one one-time re-score per founder (~$0.05–0.10), then free.
- **2026-06-10 (BrightData deepening — LinkedIn recommendations + Crunchbase
  foundation):** (a) the `[brightdata]` LinkedIn enricher now also surfaces
  `recommendations_count` (peer-vouched credibility) as a fact, and captures the
  stable `linkedin_num_id` (the bulletproof future dedup key). (b) Built the
  **Crunchbase** company enricher (`enrichers/brightdata-crunchbase.ts` + client
  `fetchBrightDataCrunchbase`): authoritative funding / acquisition / employee /
  web-traffic (Semrush) / app-download (Apptopia) / investor data, corroborated to
  the subject's company (founders-include-subject OR website-domain-in-footprint).
  New `CRUNCHBASE COMPANY DATA` rubric section tells the model to fold those
  authoritative numbers into the right rows (fundraising/exit/operator) and to
  award a modest TRACTION row on 100k+ monthly visits / downloads. A new
  credibility-vector rule routes web-visits / app-downloads / headcount phrasing
  to the **traction** axis (after the operator-scaling rule, so "scaled the eng
  team" still routes to operator). **The Crunchbase enricher is NOT wired into the
  live registry yet** — a collection takes ~19–32s (too slow/variable for a
  synchronous eval). It needs ASYNC wiring (trigger → cache on the eval → apply on
  the next re-score). The client + corroboration + fact rendering are unit-tested
  and ready. No live scoring values changed by this entry (LinkedIn rec-count is a
  context fact the model may weigh; Crunchbase contributes nothing until wired).
- **2026-06-10 (no scoring change — GitHub-less duplicate dedup):** `runEval`
  gained a second identity-dedup key for people with NO GitHub: same name + same
  dedicated (non-generic) website returns the existing profile instead of a "-2"
  twin (the duplicate-handle case: /in/jokafor vs /in/jordan-okafor-9239989a, both
  a personal domain). `identity-dedup.ts` adds `isSamePersonByWebsite` + `dedupWebsiteDomain`
  (generic/social hosts excluded). No points, rules, or attribution changed.
- **2026-06-10 (new output: credibility title):** the LLM now emits a
  `credibilityTitle` — one punchy sentence describing the person (e.g. "4x-exited
  YC founder and angel investor now building Chief"), shown above the profile
  badges. New `CREDIBILITY TITLE` rubric section (no points/scores allowed in it,
  per the disclosure rule). Persisted to `evaluations.credibility_title`
  (migration 0047), preserved on re-score when a run yields none (same
  preserve-on-empty rule as industries). No points/rules/curves changed.
- **2026-06-10 (bugfix — re-score no longer wipes Industries):** `reEvaluate`
  used to overwrite `canonical_industries` with the fresh run's output every
  time. The `industries` field is OPTIONAL in the LLM output and varies run to
  run (a thinner re-fetched LinkedIn page can yield none), so a re-score that
  inferred no industries blanked the Industries badges on an existing profile.
  Now `canonicalIndustries` is preserved when the fresh set is empty (same
  preserve-on-empty rule already used for founder/investor status). Points
  unaffected.
- **2026-06-10 (no scoring change — reason wording + disclosure guard):** the
  LinkedIn follower-reach row's reason no longer states the per-follower formula
  (user-facing reasons must never disclose point values — hard rule). Points
  awarded are byte-identical (still floor(followers/1000)); only the displayed
  sentence changed. Added a `.husky/pre-commit` "point-disclosure guard" that
  blocks any staged reason/bullet string revealing point values. No rules,
  curves, or attribution changed.
- **2026-06-10 (new source: BrightData + LinkedIn follower-reach scoring):**
  added the `[brightdata]` enricher (`enrichers/brightdata.ts` + client
  `lib/brightdata.ts`, keyed `BRIGHTDATA_API_KEY`, paid ~$0.0025/record). It
  pulls a structured LinkedIn profile BY URL (identity is exact — the subject's
  own profile URL — so no same-name corroboration needed) and surfaces follower
  reach, current company, experience roles, education, honors, certifications,
  languages, and recent-activity count as `[brightdata]` facts. **New SYSTEM-
  computed founder rule:** LinkedIn follower reach = **1 point per 1,000
  followers** (floor), added in code by `addLinkedinFollowersBonus` in
  `scoreInputs` (verification="authoritative", so it doesn't drift on re-score);
  e.g. 27,680 followers → +27. The rubric now tells the model NOT to award
  follower points itself (avoids double-count). Capped only by the global
  per-item clamp (MAX_POINTS_PER_ITEM=200, i.e. ≥200k followers → 200). Waterfall:
  new "Enhancing your profile with Bright Data" step; LinkedIn-sourced findings
  nest under "Looking you up on LinkedIn", Crunchbase under "Bright Data".
  Rescore-to-apply. NOTE: runs on every eval (latency ~7–22s, cost ~$0.0025);
  caching the raw record on the evaluation is the documented follow-up. Crunchbase
  company data is validated (Socialcast→acquired_by VMware, etc.) but not yet
  wired pending founder→company slug resolution.
- **2026-06-09 (industry badges, verified accurate — no scoring change):** the
  only `scoring.ts`-adjacent touch is `src/lib/badges.ts`: `computeBadges` now
  emits turquoise `industry:<slug>` display pills from `canonical_industries`,
  and profile badges link to their leaderboard filter. Badges carry NO points
  and do not feed scoring — `SCORING_RUBRIC`, the breakdown, and all attribution
  are unchanged. Rubric re-read against the change and confirmed still accurate.
- **2026-06-09 (org badges, verified accurate — no scoring change):** added
  host/sponsor-defined custom badges ("org badges") that admins can bulk-apply to
  scored profiles. The only `scoring.ts`-adjacent touch is `src/lib/badges.ts`:
  `computeBadges` now surfaces `org:<id>` `badge_overrides` rows as gold "identity"
  display pills. Badges carry NO points and do not feed scoring — `SCORING_RUBRIC`,
  the breakdown, and all attribution are unchanged. Rubric re-read against the
  change and confirmed still accurate.
- **2026-06-09 (refactor, verified accurate — no scoring change):** split the
  1,374-line `scoring.ts` god file into `scoring-rubric.ts` (the `SCORING_RUBRIC`
  prompt), `scoring-schema.ts` (the Zod schemas + types), and `scoring.ts`
  (post-processing helpers + a re-export barrel so every `@/lib/scoring` import is
  unchanged). The rubric was carved BYTE-IDENTICAL (md5-verified against the current
  prompt) — not one character changed, so scoring output is identical. Pure file
  organization; no points, rules, schemas, or attribution changed.
- **2026-06-08 (admin name-hint — score profiles no public API can read):** for a
  profile even EnrichLayer can't read (the owner set LinkedIn to PRIVATE), a
  super-admin can attach a manual name + roles/about "hint". `researchSubject` now
  takes an optional `manualHint` and PREPENDS it (authoritative) to the LinkedIn page
  text, so name extraction + the grounded name-search + the enrichers all get content
  (it also avoids the low-signal short-circuit). Threaded reEvaluate → computeFreshScore
  → researchSubject; the hint persists in a new `evaluations.manual_profile_hint`
  column (migration 0040) across re-scores. Super-admin endpoint `POST /api/admin/
  profiles/[id]/hint` sets it + re-scores; `ManualHintButton` in the AdminProfileBox.
  REQUIRES the prod column migration before deploy (queries select it).
- **2026-06-08 (EnrichLayer LinkedIn fallback — fixes "not enough information"):**
  LinkedIn blocks Exa's content fetch for many profiles (niche professionals /
  investors whose presence is primarily on LinkedIn) — the fetch returns 0 chars, so
  the scorer never learns the name/roles and the profile is low-signal ("not enough
  information"). `researchLinkedinProfile` now falls back to **EnrichLayer** (formerly
  Proxycurl — a real LinkedIn data API, no scraping; `ENRICHLAYER_API_KEY`) ONLY when
  the Exa fetch comes back empty, and uses its structured profile (name, headline,
  experiences, education, honors, follower count) as the LinkedIn page text.
  Cost-controlled: fires only on the profiles that need it (~$0.10/call).
  `buildProfileText` pure/tested; live-verified (a famous software-company founder → 502-char blob). NOTE:
  cannot rescue a profile set to PRIVATE (EnrichLayer 404s "marked as private" — no
  public API can read a private profile). `enrichLayerUsed` flag in grounding.
- **2026-06-08 (GitHub identity — username-encodes-name signal):** `githubMatchConfidence`
  now also weighs whether the GitHub LOGIN encodes the subject's specific name
  (`usernameEncodesName`, e.g. `zaraquinn` → "Zara Quinn"; +0.4 when strong) and SOFTENS
  the non-correlating-company penalty (−0.4 → −0.15) when ownership is strong (full-name
  match AND a name-encoding handle). Fixes the over-conservative matcher that stripped
  legit owners (Alex Romero, Gita Nair, Zara Quinn) when their GitHub company field wasn't
  in our scraped data, WITHOUT re-admitting mis-attaches (a handle won't encode a
  different-named victim — `mreyes` ≠ "Marlin Reyes", `octo-org` ≠ its 5 people).
  Company correlation is still the strongest tier (0.95). KNOWN LIMITATION: for genuinely
  common names (two real "Lena Park"s) the handle can't disambiguate; only company
  correlation can. Rescore-to-apply.
- **2026-06-07 (new source: YouTube — talk/media reach):** added the `[youtube]`
  enricher (`enrichers/youtube.ts`, free w/ `GOOGLE_API_KEY`, YouTube Data API v3).
  Surfaces talks / interviews / media coverage = thought-leadership REACH by view
  count. **Identity: the fuzziest surface, so gated HARD** — only counts a video
  whose metadata (title/description/channel) mentions one of the subject's own
  COMPANY tokens (from `extractCompanyNames`); if no company can be extracted, YouTube
  is skipped (precision over recall). Rubric "YOUTUBE REACH": top corroborated video
  10k/100k/1M+ views → +3/+6/+10 [GTM/Distribution]. Live-verified (a famous chip-company CEO: 10
  company-corroborated videos, ~25.1M views). Waterfall step + `youtube.com` host
  mapping. NOTE: search costs 100 quota units (10k/day → ~100 evals/day before 403 +
  no-op). Rescore-to-apply.
- **2026-06-07 (new source: Google Knowledge Graph — notability threshold):** added
  the `[google-kg]` enricher (`enrichers/google-kg.ts`, free w/ `GOOGLE_API_KEY`). A
  Google knowledge panel is a notability threshold that's hard to manufacture. **Identity-
  safe:** gated on name overlap (both first+last) + CORROBORATION — the entity
  description must read as a tech/business person OR mention a subject token (company),
  so a same-named actor/athlete's panel can't attach (`kgNameOverlap` + `kgCorroborated`,
  tested). New rubric "GOOGLE KNOWLEDGE GRAPH": corroborated entity → +4 once [Domain],
  distinct from Wikipedia/Wikidata but with guidance to keep total notability modest.
  New waterfall step "Checking Google's Knowledge Graph…" + `google.com` host mapping.
  *(YouTube Data API is the companion signal but is not yet enabled in the GCP project —
  enable "YouTube Data API v3" and it'll be wired next.)* Rescore-to-apply.
- **2026-06-06 (Wikipedia pageview magnitude — notability strength):** the
  `[wikipedia]` enricher now also fetches average monthly pageviews (Wikimedia REST
  metrics, keyless) for the resolved page. New rubric tier (separate from the binary
  +5 "has a page"): 1k–9,999/mo → +3, 10k–49,999 → +6, 50k+ → +12 — a fame/prominence
  MAGNITUDE signal mapping onto Domain Expertise. `pageviewsFact` pure/tested. Nests
  under the existing Wikipedia waterfall step. Rescore-to-apply.
- **2026-06-06 (HN deepening — Show HN launches + front-page virality):** the
  `[hackernews]` enricher now also surfaces (from the stories it already fetches, no
  extra call): **Show HN** posts (a PRODUCT-LAUNCH event — builder signal) and the
  count of posts scoring **100+ points** (very likely FRONT-PAGED — virality/reach).
  New HN sub-rules: Show HN → +4 (+8 if any reached 50+ pts) [Technical Depth];
  front-page posts → +3 / +6 / +10 by count (1 / 2–4 / 5+) [GTM / Distribution].
  `hnLaunchFacts` is pure/tested. Findings nest under the existing HN waterfall step.
  Rescore-to-apply.
- **2026-06-06 (verified accurate — no scoring change):** `eval-pipeline.ts` gained
  identity-based dedup in `runEval` (return an existing profile when a freshly-scored
  person's GitHub username + name + website/company match a profile under a different
  LinkedIn URL — see `identity-dedup.ts`). Profile-creation/dedup only; it does NOT
  change how points are awarded. Rubric re-read and confirmed still accurate.
- **2026-06-06 (new source: Libraries.io SourceRank — technical depth):** added the
  `[librariesio]` enricher (`enrichers/librariesio.ts`, free with `LIBRARIESIO_API_KEY`).
  It surfaces **SourceRank** — Libraries.io's COMPOSITE OSS-reputation score (folds in
  docs, contributors, dependents, recency, license) — much harder to game than raw
  stars — plus contributor counts, for the founder's repos. **Identity-safe:** keys
  off the already-confidence-gated GitHub login (new exported `resolveConfidentGithub
  User` in `github.ts`, reused so there's no new same-name match surface). New rubric
  block "LIBRARIES.IO SUB-RULES": top-SourceRank tier (15–19→+4, 20–24→+8, 25+→+15) +
  50+-contributor repo (+5), Technical Depth, explicitly NOT double-counting the raw-
  star GitHub rules. New waterfall step "Checking Libraries.io for your SourceRank…"
  + `libraries.io` host mapping. Rescore-to-apply.
- **v0.0.14 — FOUNDER EXIT now uses max(CURRENT, IPO) market cap, not IPO-day.** A
  data bug: the rubric told the model to use a public company's market cap AT IPO,
  so a famous chip-company CEO's company was scored at its 1999 IPO cap (~$6B → 74 pts) instead of
  its current ~$3.5T — leaving the founder of the world's most valuable company at
  #14. Fix: the `founder_exit` rule now awards on the **HIGHER of current or IPO**
  market cap (NOT peak); the model must look up the CURRENT market cap for any
  still-public company (the IPO figure is a floor). New `extractedMetrics.current
  MarketCapUsd` field. With ~$3.5T, the company's row → ~1,775 (sqrt) → the chip-company CEO ≈ #1. This
  is RESCORE-to-apply (changes what the model emits) — existing public-company
  founders recorded at stale IPO-day caps need a re-score to pick up current value.
- **v0.0.13 — ENTERPRISE VALUE IS NOW A SQUARE-ROOT CURVE (no cap).** The v0.0.12 log
  curve compressed too hard — Stripe ($91.5B) earned only ~1.2× Groupon ($12.7B)
  despite being 7× more valuable, and a serial founder's portfolio of mid-size
  companies (summed) out-ranked a single generational one (a serial founder > a single-company founder).
  Replaced log with **square root**: `points(usd) = round(C·√usd)`, C set so a $100B
  company ≈ **300 pts** ($200M→13, $1B→30, $12.7B→107, $91.5B→287, $1.74T→1,250).
  Now a more valuable company is worth proportionally more (Stripe ≈ **2.7×** Groupon),
  **NO CAP** (generational founders are MEANT to far outscore — a founder's job is
  creating company value), and every company still **sums** (no best-company
  weighting, per DROdio). This naturally fixes the single-company founder (#2/#3) > the serial founder (#9)
  without diminishing — one Stripe out-earns a portfolio of smaller exits.
  `enterpriseValuePoints` + `curvedDollarPoints` in `scoring.ts`; applied in
  `eval-pipeline.applyEnterpriseValueCurve`. venture_raised at half weight (capital
  in, not value created). Existing rows recalibrated from the original-linear backup
  (`scripts/recompute-dollar-curve.ts`, idempotent — re-derives from originals).
- **v0.0.12 — DOLLAR-MAGNITUDE ROWS ARE NOW LOG-COMPRESSED (the calibration fix).**
  An audit found the founder total was ~pure company market cap: the old linear
  "+1 per $1M, uncapped" hit **1,736,900** for Microsoft's ~$1.74T while every skill
  signal (technical/operator/domain/gtm/prestige) tops out ~255 — so the leaderboard
  ranked by company size, and no amount of technical signal could move it. The three
  dollar rules (`founder_valuation`, `founder_exit`, `venture_raised`) are now passed
  through a bounded LOG curve, `curvedDollarPoints` → `dollarSignalPoints` in
  `scoring.ts`: `points = max(1, round(k·(log10(usd)−6)))`, k=40 for outcome
  (valuation/exit), k=20 for raise. So $10M→40, $100M→80, $1B→120, $100B→200,
  $1.74T→250. Applied deterministically in `eval-pipeline.scoreInputs`
  (`applyDollarLogCurve`, before clamp/weighting); the model still emits the linear
  figure so the dollar amount is recoverable. **Effect (preview over 872 prod
  profiles):** credibility now beats size — technical founders climb hard
  (morgan-hale, gabe-sutton, quinn-park, dustin-shaw) while mega-cap
  founders compress but stay elite (a famous software-company founder 1.74M→505). Existing rows are
  recalibrated by a one-pass recompute (`scripts/recompute-dollar-curve.ts`) — no
  re-research/LLM needed, since the dollar figure is recoverable from the stored
  points. The `k` constants are the single knob for outcome-vs-skill weighting.
- **2026-06-06 (GitHub GraphQL contribution graph — current-technical-depth):** the
  GitHub enricher now also pulls the **contribution graph** via GraphQL for the
  ALREADY-CONFIRMED login (no new identity surface — reuses `githubMatchConfidence`).
  New facts: trailing-12-month commits/PRs/reviews, **private/restricted
  contribution count** (the fix for a public profile that looks dormant while its
  owner ships daily in PRIVATE repos), external repos contributed to, public gists,
  and GitHub Sponsors. New rubric block "GITHUB CONTRIBUTION-GRAPH SUB-RULES":
  volume tier (250+/1k+/3k+ → +5/+10/+18), private-contribution bonus (+3/+6, also
  overrides the Dormant penalty), external-repo collaborator (+1 per 5, cap +8),
  gists (+2), Sponsors (+5/+8). GraphQL requires `GITHUB_TOKEN` (present in prod);
  no-ops gracefully without it. `fetchGithubContributions` + `githubContributionFacts`
  are pure/tested. Rescore-to-apply.
- **2026-06-06 (prestige data-sourcing — makes v0.0.11 actually fire):** the Exa
  deep-research query (`researchLinkedinProfile` in `exa.ts`) only named funding /
  company terms, so the search never surfaced honors and the PRESTIGE tier was
  data-starved — a rescore of a well-known consumer-marketplace founder produced ZERO prestige rows despite his
  TIME100 / Forbes coverage (his 33k-char research blob contained no award facts).
  The query now also names awards / honors / Forbes / Fortune / TIME / 30-under-30 /
  fellowship / Thiel / Rhodes / MacArthur / press. After the change the founder scores
  "Named to Fortune's 40 Under 40 (+8, T2, off-radar)" and funding recall is
  unharmed (SEC Form D + structured fields still feed it). numResults stays 10
  (no cost change). Validated by dev rescore.
- **v0.0.11 — PRESTIGE / RECOGNITION is now a scored category.** Third-party
  recognition (Thiel Fellowship, Rhodes, MacArthur, Nobel/Turing, NAE/NAS,
  academic-olympiad medals → Tier 1 +12–18; Forbes 30u30 / TIME100 / Fortune 40u40 /
  tier-1 feature profiles → Tier 2 +6–10; regional awards / notable press → Tier 3
  +2–4) is awarded consistently by the scorer as a normal breakdown row (with a
  confidence level), **no overall cap**, distinct honors stack, each once. A
  double-count guard excludes YC / Wikipedia / research (those have dedicated rules).
  **Radar nuance:** a recognition that EVIDENCES a competency names it in the reason
  and routes to that axis (WSJ-on-go-to-market → GTM, "scaling the eng org" →
  operator) via new substance-first attribution rules; a bare recognition scores its
  points but stays OFF the radar by design (counted in the total, not lost). New
  waterfall step "Searching for prestige signals (…)" + tier-1-outlet host mappings
  in `eval-steps.ts`. This is a RESCORE-to-apply change (it changes what the model
  scores), unlike the two view-time fixes below.
- **2026-06-05 (refactor, verified accurate — no scoring change):** replaced the
  hard-coded 16-entry `Promise.allSettled` array in `enrichers/index.ts` with an
  `Enricher[]` registry + a testable `runRegistry(enrichers, ctx)`. The SAME 16
  enrichers run with the SAME arguments and the SAME aggregation (keep facts, sum
  Exa cost, per-source timeout) — purely a structural change so adding/removing a
  data source is one registry entry. No points, rules, attribution, or which
  sources fire changed; the rubric below remains accurate as of this date.
- **2026-06-05 (github identity: confidence model + company correlation):** replaced
  the binary GitHub-match check (which auto-trusted ANY Exa-surfaced github URL —
  the actual hole that let github.com/rbanner, an OpenAI engineer also named Robin Banner, attach to the entrepreneur Robin Banner) with `githubMatchConfidence`
  (0-1, accept >= 0.5). Layered: (a) the github account's stated COMPANY appearing
  in the subject's own LinkedIn data → ~certain (0.95); a company that does NOT
  appear penalizes the score (different same-named person); (b) otherwise a sum of
  full first+last name match + surfaced-URL, with a surfaced URL ALONE no longer
  sufficient. This drops wrongly-attributed GitHub from same-name collisions
  (affected scores fall on re-score). No point formulas changed.
- **2026-06-05 (credibility presentation — fixes lost-signal attribution gaps):**
  an audit of 871 prod profiles found breakdown rows that score points but
  attribute to NO radar vector (so the points count in the founder/investor TOTAL
  but never appear on the radar). Two regex gaps fixed in `credibility-vectors.ts`:
  (a) founder **valuations written long-form** — "valued at over $29 billion" —
  matched nothing (the rule only caught abbreviated "$29B"); alex-tan lost his
  ENTIRE 29k traction axis to null, wes-porter 7k. The traction rule now matches
  spelled-out amounts + the words "valued"/"valuation"/"market cap". (b) **generic
  investor identity rows** — "seed/scout/active investor", "portfolio including …" —
  matched nothing (only "angel investor"/"portfolio of" were caught); ~550 investor
  points were lost across thin investor profiles. The firm rule now has a
  bare-`investor`/`scout` catch-all (runs after outcomes+portfolio, so quantifiable
  rows still route correctly). PRESENTATION-only (no points/rules change); takes
  effect at view time, no rescore. Audit script: `scripts/audit-radar-attribution.ts`.
- **2026-06-05 (credibility presentation — fixes the percentile artifact):** the
  radar percentile is now computed with `signalHaverPercentile` — it ranks a
  profile's per-axis points ONLY against profiles that HAVE signal on that axis
  (raw > 0), not the whole zero-heavy population. An audit of 870 prod profiles
  found 42 founders with a thin technical raw (13–19 pts of GitHub-identity/dev.to
  presence) sitting at the 85th–88th percentile, because most founders have zero
  technical signal so any nonzero score ranked high. Now a thin score lands
  honestly mid-pack and the top is reserved for real depth; a no-signal axis shows
  0 (paired with `coverage:false`). This is a PRESENTATION change in
  `credibility.ts` — it does not change any awarded points, rules, or attribution,
  and it takes effect at view time (no rescore needed).
- **2026-06-05 (identity-conflation fixes):** (a) GitHub enricher no longer tries
  the LinkedIn vanity handle as a GitHub username — `/in/rbanner` (the entrepreneur Robin Banner) was resolving to github.com/rbanner, a different engineer also named Robin Banner, attributing his repos to the entrepreneur. Real github is still
  found via Exa-surfaced URLs + name-derived handles (both name-gated). This
  REMOVES wrongly-attributed GitHub points from same-name collisions (scores that
  were inflated by a different person's repos will drop on re-score). (b) The
  public `recommendations.summary` prompt now forbids identity-disambiguation /
  data-quality meta-notes — the model must silently ignore mismatched enrichment
  data and write only about the person. (OpenAlex same-name attribution — e.g. a
  medical researcher "Robin D. Banner" — remains a known harder case.)
- **2026-06-05 (non-scoring)** — `recommendations` reframed from advice/priorities
  into proposed IRL Festival events (prompt-only; no change to point scoring). See
  the `recommendations` field note below.
- **2026-06-05 (events analytics, verified accurate — no scoring change):** added
  `getAveragedRadars()` to `src/lib/credibility.ts` for the Event Followups recap —
  it averages a cohort's already-attributed per-axis points and percentile-ranks
  them against the existing population. Purely additive aggregation for display; it
  does not change how points are awarded, attributed, clamped, or weighted. Rubric
  doc re-read and confirmed still accurate.
- **2026-06-05 (reliability, verified accurate — no scoring change):** added a
  per-enricher timeout (`withEnricherTimeout`, default 15s, env `ENRICHER_TIMEOUT_MS`)
  around every source in `enrichers/index.ts`. Enrichers run in parallel via
  `Promise.allSettled`, which waited for the slowest member, so one hung external
  API stalled the whole eval to the route's `maxDuration`. On timeout an enricher
  now resolves to an empty result — identical to how `allSettled` already dropped a
  *failed* enricher — so no points, rules, or attribution change; the only behavioral
  effect is that a genuinely-hung source's facts are omitted (graceful degradation)
  instead of blocking the eval. Rubric content below remains accurate as of this date.
- **v0.0.10** — **Company-OSS bonus now gated on the founder being PERSONALLY
  technical.** A non-technical consumer-marketplace founder scored 100th-percentile Technical Depth from a single
  +129 row: "Founded the company behind a 148k★ OSS org" — the v0.0.8
  company-flagship OSS bonus, which fired for ANY founder regardless of whether
  they wrote the code. Fix: the scorer now emits `technicalFounder` (boolean — is
  the INDIVIDUAL an engineer/technical builder, vs. a business/design/ops founder
  of a technical company), and `addCompanyGithubBonus` only awards the company-OSS
  bonus when `technicalFounder === true`. So a technical developer-tools founder
  and a technical payments founder still get it; a non-technical (designer/business) CEO
  does not. `technicalFounder` is judgment metadata — it awards no
  points itself; it only gates the existing bonus. (Existing profiles must be
  RESCORED to pick this up.)
- **2026-06-05 (industries field — metadata, no points):** the scorer now emits an
  `industries: string[]` field — the founder's company sector(s) and/or an
  investor's focus areas (drawn from the company, the HN content topics, and
  investor industry-focus enrichers). It's normalized to the canonical
  `src/lib/industries.ts` taxonomy and stored in `evaluations.canonical_industries`
  (a `text[]` column) for the Industries section + leaderboard industry filter.
  Display/categorization metadata only — awards no points, changes no rules. The
  point-awarding rules below remain accurate.
- **2026-06-05 (reliability, verified accurate — no scoring change):** make the
  founder/investor status markers populate reliably. (a) The rubric now marks
  `founderStatus` / `investorStatus` as REQUIRED top-level fields the model must
  always emit (it was silently dropping them on very large outputs like a heavily-covered founder). (b) When the model still omits one, `computeFreshScore` backfills it
  with the cheap classifier (`classifyStatuses`) from the data just scored. (c)
  `reEvaluate` preserves a previously-known status when a re-score returns null,
  so a re-score never wipes a marker. All three touch only the two classification
  fields — no points/rules/curves/attribution changed.
- **2026-06-05 (bugfix, verified accurate — no scoring change):** `founderStatus`
  AND `investorStatus` in `SCORING_SCHEMA` were bare required enums; when the
  model omitted/mis-returned either, zod `safeParse` failed on that field (both
  retries) and the ENTIRE eval threw → `/api/rescore` returned "rescore failed"
  (repro'd on Sam Rivera). Both are now `.nullable().catch(null)` so a missing value
  degrades to null ("not yet determined") instead of failing the eval. Both fields
  are independent of the score and award no points — no rules/points/curves/
  attribution changed; the rubric above remains accurate as of this date.
- **v0.0.9** — **HN content analysis → INDIVIDUAL technical depth + domain, in the
  right buckets.** Motivation: HN signal was firing but landing entirely in the
  GTM vector (the attribution rule blanket-routed "hacker news/karma" → gtm), and
  it only measured REACH (karma/posts), never what the person actually writes.
  Also: founders of technical companies (e.g. the founders of a well-known payments company) got
  technical credit for the *company*, not themselves. Changes: (a) the
  `[hackernews]` enricher now surfaces a **sample of the person's longest HN
  comments** (HN hides comment scores, so length proxies substance); (b) a new
  "HACKER NEWS CONTENT ANALYSIS" rubric block tells the model to judge the
  CONTENT and emit at most one row per dimension — INDIVIDUAL technical depth
  (≤+8, only for real engineering substance), domain expertise (≤+6), etc. —
  explicitly distinct from credit for founding a technical company; (c)
  `credibility-vectors.ts` now routes rows that say "technical depth" / "domain
  expertise" by their **substance** (technical/domain) BEFORE the generic
  `hacker news → gtm` rule, so content-derived signals bucket correctly while raw
  karma/reach stays GTM.
- **2026-06-05 (classification fields, verified accurate — no scoring change):**
  scoring now also emits two CLASSIFICATION fields, `founderStatus` and
  `investorStatus` (each `current` | `past` | `never`), judged on company-founding
  and investing history respectively. They are display metadata only — they drive
  the current/past/never markers next to the Founder and Investor scores on the
  profile and do NOT award, change, or gate any points. The point-awarding rules,
  curves, and attribution below remain accurate as of this date.
- **2026-06-05 (perf, verified accurate — no scoring change):** raised the
  `/api/rescore` + `/api/eval` `maxDuration` 60→180s and parallelized the HN
  identity-resolution fetches (heavy profiles like large, heavily-covered founders were
  exceeding 60s and failing with a bare "Network error"). No points, rules, or
  attribution changed — the rubric content above remains accurate as of this date.
- **v0.0.8c** — **HN rows now deep-link to source (UX, no point change).** A
  deterministic post-score step (`applyHnCitations`) injects per-phrase citations
  from the HN enricher's URLs: a karma figure / `@handle` → the HN profile, a
  story-post count → the submissions feed, and a top-post title → that post on HN.
  Renders as the existing clickable underlined phrases. (Note: HN activity is
  still attributed to the GTM vector; routing HN *content* to the right vector is
  the next increment, "A".)
- **v0.0.8b** — **HN identity, tier 4: the tkmx leaderboard as an identity
  source.** Content discovery (v0.0.8a) only finds a handle when the subject's
  own domain is in the Exa highlights — which misses Sam Rivera (his identifying HN
  domain is an old blog modern search won't surface). Added a 4th `resolveHnHandle`
  tier: match the subject to a HN Tokenmaxxing leaderboard entry by a known handle
  OR a prefix-tolerant name match ("Sam Rivera" ↔ `hn_username` "Sam_Rivera"), then
  confirm via HN bio corroboration. Catches arbitrary handles for anyone listed on
  tkmx. Still capture-only — no point values changed. (Existing profiles must be
  RESCORED to pick up any of these capture fixes — the rubric only affects new scores.)
- **v0.0.8a** — **HN identity-resolution fix (capture, not weighting).** No point
  values changed. The Hacker News + HN Tokenmaxxing enrichers used to only fire
  when Exa had already surfaced the subject's `news.ycombinator.com/user?id=` URL,
  so they silently missed people whose HN profile wasn't surfaced — including
  Sam Rivera (#1 on the Tokenmaxxing board) and DROdio, both of whom are listed on
  tkmx. Added a shared `resolveHnHandle()` with a third tier: **content discovery**
  — search HN for stories linking the subject's own domains, take the
  bio-corroborated dominant author (HN usernames are case-sensitive + arbitrary,
  e.g. "Sam_Rivera", so name-guessing can't find them). HN Tokenmaxxing now reuses
  this resolved handle instead of only Exa URLs, so the leaderboard-presence and
  rank tiers (+10 / +10/+20/+35) actually fire for listed founders.
- **v0.0.8** — **Technical-depth recalibration: reward IMPACT, de-weight
  presence/age.** Motivation: a non-technical founder (e.g. DROdio) scored 92nd
  percentile on the Technical Depth radar vector almost entirely on "has an old
  GitHub account + pushed once recently," while a genuinely technical founder
  (a developer-tools founder) scored only
  83rd because his real OSS lives in the company **org**, which the personal-account
  enricher never sees. Changes: (a) **GitHub presence/age de-weighted** — identity
  +3→+2, tenure/age +3→+1, and the **recency bonus is gated on real building**
  (full +15 only for a "substantial builder" — a ≥500★ repo or ≥10 non-fork repos;
  else +3). (b) **Impact boosted** — top-repo curve `20× → 25× log10(stars)`,
  additional-1k★-repos +15/max2 → +20/max3, a new 20k+ followers → +20 tier.
  (c) **New company-flagship OSS bonus** (code, post-scoring, keyed on the resolved
  company domain → GitHub org's top repo) credits founders for their company's OSS
  on the same uncapped star curve. Net effect: truly technical founders score
  meaningfully higher; "I have a GitHub account" founders fall back toward the
  middle. See the new **"How a technical founder earns points"** section.
- **v0.0.7** — **Audit reconciliation: dev.to + Neo were live in code but
  undocumented here.** (1) Added the **dev.to technical-writing** founder
  sub-rules (shipped PR #174, merged 2026-06-03) — +2 presence / +6 sustained
  writer / +6 high-impact / +4 active-12mo, stacking, **cap +18**; see the new
  "DEV.TO technical-writing sub-rules" block in the Founder Rubric. (2) Added
  **Neo** (neo.com investor enricher, shipped PR #172, merged 2026-06-03) to the
  data-sources table and a new Investor-Rubric note — Neo is **evidence-only
  (zero points)**; it grounds the existing investor rows and drives investor
  badges (Featured on Neo / Leads Rounds / stage + industry focus). (3) Fixed the
  **mechanics step-2 uncapped-rule list**: it named only `venture_raised` +
  `github_top_repo`, but `UNCAPPED_UPPER_RULES` has had **four** rules since
  v0.0.5/v0.0.6 — also `founder_exit` + `founder_valuation`. (4) Refreshed the
  Extracted-metrics list to include `ipoMarketCapUsd`, `acquisitionPriceUsd`,
  `peakValuationUsd`. No scoring math changed in this version — doc-accuracy only.
- **v0.0.6** — **Majestic Million rebalanced + matched correctly.** Replaced the
  `min(100, floor(10000/rank))` cliff (which gave +0 past rank ~10k) with a LOG
  curve `round(20 × (6 − log10(rank)))` spanning the whole 1…1M range (#25,405 →
  +32 instead of +0). It is now **computed in code from the RESOLVED
  primaryCompanyDomain** (the pre-scoring lookup ran before the LLM picked the
  company, so it usually missed it) — see `addCompanyMmBonus` /
  `majesticMillionBonus`. The LLM no longer emits an MM row. Also: **founder_valuation
  rows are pinned to "authoritative"** in code so the double-verification step can't
  randomly ×0.6 them — a $1.5B founder was swinging between +1500 and +900 across
  re-scores on the LLM's verification call alone; now stable at +1500.
- **v0.0.5** — **Founder valuation** rule added: a still-private company's peak
  post-money valuation scores `max(1, floor(peakValuationUsd / $1M))`, **uncapped**
  (rule `founder_valuation`), and **supersedes "Venture raised"** for that company.
  Motivation: a founder of a $1.5B private unicorn (e.g. a developer-tools founder) was scoring ~26 because the valuation/raise was never reflected. Also:
  (a) **funding/valuation extraction is now a named top priority** in the prompt
  (populate `totalRaisedUsd` + `peakValuationUsd` from company funding news, not
  just the person's SEC filings); (b) **GitHub** now attributes the COMPANY's org
  repos for founders and **never applies the dormant −15 to a verified founder/CEO**;
  (c) documents the **dollar-weighted `founder_exit`** rule (was shipped in code but
  this doc still listed a flat +10 per exit — corrected).
  *Known gap:* the **Founder Majestic Million bonus** (`min(100, floor(10000/rank))`)
  yields +0 for domains past rank ~10k AND the MM lookup runs before the company
  domain is resolved, so it rarely fires for real companies (apollographql.com is
  #25,405 → +0). A formula/timing rebalance is deferred — tracked in Roadmap.
- **v0.0.4** — **Venture raised** rule changes: minimum +1 for any verified raise
  (so seed founders get a signal), then `max(1, floor($M))`, **NO upper clamp**.
  **GitHub top repo** rule replaces the 6-tier table with `round(20 × log10(stars))`
  for stars ≥ 100, also **NO upper clamp**. Both rules emit `rule:
  "venture_raised"` / `rule: "github_top_repo"` so `clampBreakdown` can let them
  through uncapped (the **±200 / −50 clamp still applies to every other row**).
  Motivation: the prior +200 clamp let a single rule dominate a score (a $20M and
  a $200M raise scored identically) and erased real outlier signal at the top end.
- **v0.0.3** — documents the **double-verification weighting** step (was missing);
  moves **NFX Signal** and **SEC EDGAR v2** (Form D fund classification + IPO/exit)
  from Roadmap → live; adds `investorStageFocus`; notes score-based low-signal
  routing.
- v0.0.2 — added the "Roadmap" section weighting every upcoming data source
  (see `docs/superpowers/specs/2026-05-26-founder-signal-data-roadmap-design.md`).
  As each source ships, move its rule from Roadmap → the live sections.
- (The filename stays `scoring-rubric-v0.0.1.md` so existing links don't break;
  the version in this title is authoritative.)

## How scoring works (mechanics)

- Every person is evaluated against **two independent rubrics**: **Founder** and
  **Investor**. The same person can score on both; a dimension with no signal
  scores 0.
- Claude emits one **breakdown row** per triggered rule: `{ points, reason,
  confidence, verification, sources }`. The reason is a single plain-English
  sentence shown to the user; `verification` + `sources` drive the weighting below.

The model's self-reported totals are **not** trusted. The final score is computed
deterministically in `scoreInputs` (`eval-pipeline.ts`) in this exact order:

1. **Research → enrich → score.** Exa research + grounded facts + parallel
   enrichers feed the prompt; Claude returns the two breakdowns.
2. **Per-row clamp** (`clampBreakdown`): each row is clamped to `[-50, +200]` —
   a guard against prompt-injection-driven inflation. **Exception:** the four
   dollar-/magnitude-weighted rules — `rule: "venture_raised"`,
   `"github_top_repo"`, `"founder_exit"`, and `"founder_valuation"` — are exempt
   from the upper bound (the magnitude IS the signal, not noise: a $1B raise
   should score +1000, an $11B IPO +11000); they're still clamped to ≥ −50 for
   injection protection. See `RULE_IDS` / `UNCAPPED_UPPER_RULES` in scoring.ts
   (all four).
3. **Double-verification weighting** (`applyVerificationWeighting`): each
   **high-value** row (`|points| ≥ 25`) is scaled by its evidence tier —
   `authoritative` ×1.0, `corroborated` ×1.0, `single-source` ×0.6,
   `self-asserted` ×0.25. Low-value rows (`|points| < 25`) pass through untouched.
   This is how a big claim backed only by the subject's own LinkedIn gets
   discounted to a quarter of its face value. **See the "Verification tiers"
   section below** — this materially changes displayed points.
4. **Recompute totals** from the now-clamped-and-weighted rows:
   `founderScore = Σ founder rows`, `investorScore = Σ investor rows`,
   `combinedScore = founder + investor`.
- **What the user sees:** `combinedScore > 0` → the profile renders; `≤ 0` →
  the `/not-this-round` "couldn't find enough public info" page
  (`deriveEvalStatus`). This is gated on the **score**, not on `signalQuality`
  (which is display-only metadata — see Hard checks #5).

## Data sources feeding the rubric

LinkedIn page text + Exa web search are the base. On top of that, parallel
enrichers contribute labeled facts (`runEnrichments`). Sources marked ✅ are live
on this branch.

| Source | What it contributes | Rubric block |
|---|---|---|
| Exa web search | press, podcasts, case studies, domains | (general evidence) |
| Exa Research grounding ✅ | citation-grounded facts (raises, exits, outcomes) → "authoritative" tier | (grounds high-value rows) |
| Majestic Million | company domain prominence rank | Founder MM bonus |
| GitHub ✅ | repos, stars, followers, account age | GitHub builder |
| Product Hunt ✅ | launches, upvotes, featured | Product Hunt builder |
| Wikipedia ✅ | notability | (notability) |
| Y Combinator ✅ | accelerator membership | YC alum |
| Hacker News ✅ | karma, posts/comments, top posts | Hacker News |
| **SEC EDGAR ✅** | **authoritative capital raised (Form D) + officer role** | SEC EDGAR / Form D |
| Stack Overflow ✅ | reputation, badges, top tags | Stack Overflow |
| npm ✅ | packages maintained, monthly downloads, direct dependents (via deps.dev) | npm |
| Hugging Face ✅ | models, downloads, likes | Hugging Face |
| Wikidata ✅ | structured occupation/employer/education + notability | Wikidata |
| OpenAlex ✅ | research papers, citations, h-index, fields | OpenAlex |
| NFX Signal ✅ | investor portfolio count, fund/firm, claimed status, leads-rounds | NFX Signal (investor) |
| **Neo ✅** | investor stage/industry focus, leads-rounds, check size (neo.com Bubble API, LinkedIn-matched, VC-only) | **evidence-only** — grounds investor rows + drives investor badges; **no points** |
| dev.to ✅ | published technical articles, reactions, recency (identity-confirmed) | dev.to technical-writing (founder) |
| HN Tokenmaxxing ✅ | curated active-LLM-user board; rank + 28-day token volume | HN Tokenmaxxing |
| Libraries.io ✅ | SourceRank (composite OSS reputation) + contributor counts per repo (GitHub-login-keyed, free w/ key) | Libraries.io |
| Google Knowledge Graph ✅ | knowledge-panel existence = notability threshold (name+description corroborated, free w/ Google API key) | Google Knowledge Graph |
| YouTube ✅ | talk/interview/media reach by view count (company-corroborated, free w/ Google API key; 100 quota units/search) | YouTube |
| Prestige / Recognition ✅ | fellowships, major awards, 30u30/TIME100, tier-1 feature profiles (from research/press grounding) | Prestige / Recognition (founder + investor) |

---

## Founder Rubric

### Core founder rules
| Rule | Points |
|---|---|
| Past founder | +5 |
| Current founder | +10 |
| **Founder valuation** (still-private company, dollar-weighted) | `max(1, floor(peakValuationUsd / $1M))` — **uncapped** (a $1.5B valuation → +1500; $500M → +500; $50M → +50). Rule `founder_valuation`. **Supersedes "Venture raised" for the same company** (the valuation already reflects the raise — don't count both). Private only — exited companies use "Founder exit". Reason cites the figure. |
| **Venture raised** | `max(1, floor(totalRaisedUsd / $1M))` when `totalRaisedUsd > 0` **and no `founder_valuation` was awarded for that company**; otherwise 0. Linear, **uncapped on the upper bound** (a $1B raise scores +1000). Any verified raise gets at least +1 so seed-stage founders still get a signal. Reason cites the exact figure. |
| Y Combinator alum | +10 |
| **Founder exit** (each founded company that exited, dollar-weighted) | `max(1, floor(exitValueUsd / $1M))` — **uncapped**, rule `founder_exit`. Acquisition → summed purchase price; IPO → market cap at IPO (e.g. GitLab ~$11B → +11000, **not** proceeds raised). Sub-$1M floors to +1. |
| Current company is profitable (public signal) | +10 |
| Any of their companies had co-founders | +5 (once total) |
| **Majestic Million prominence** (SYSTEM-computed in code from the resolved `primaryCompanyDomain`, not the LLM) | `round(20 × (6 − log10(rank)))` — log curve over the full 1…1,000,000 range: #1 → +120, #100 → +80, #1k → +60, #10k → +40, #25,405 → +32, #100k → +20, #1M → 0. A **founder** of the domain gets the full bonus; a non-founder **employee** gets ×0.1. Tagged `authoritative` (a DB rank lookup). |

> **Founder detection is a floor, not a ceiling:** if any source names the subject
> as founder/co-founder/CEO or says they "started/founded" a company, the +5/+10
> row MUST be emitted even if raise/YC details are uncertain.

### GitHub builder sub-rules (`[github]`)
> **Principle (v0.0.8): IMPACT, not presence.** Technical depth is demonstrated
> impact — popular OSS (stars), real usage (downloads/dependents), a large
> developer following — **not** merely having a GitHub account, its age, or a
> single recent push to a starless repo. Presence/age are weighted lightly;
> impact is weighted heavily and uncapped.
- **Attribution:** for a FOUNDER the most important OSS is usually the COMPANY's
  GitHub **org**, not the personal account. The company-org flagship is awarded
  **in code** (see "Company-flagship OSS bonus" below); the LLM awards the
  top-repo rule only for the subject's **own personal** repos so the two don't
  double-count.
- Identified GitHub account: **+2** once *(was +3 — mere identification is low signal)*
- Active builder (≥10 non-fork repos): **+5** once
- Tenured account (age ≥ 5y): **+1** once *(was +3 — account AGE is a weak technical signal by itself; this directly de-weights the "old GitHub account = technical" inflation)*
- Followers: 1,000–4,999 → **+5**; 5,000–19,999 → **+12**; 20,000+ → **+20** *(a real developer audience is impact)*
- **Top non-fork PERSONAL repo by stars** (award once): `round(25 × log10(stars))` for any repo with ≥100 stars; under 100 → 0. **Uncapped.** Calibration (boosted from 20× in v0.0.8): 100 → +50, 1k → +75, 10k → +100, 44k → +116, 100k → +125, 1M → +150.
- Each additional non-fork repo with 1,000+ stars (max **3**): **+20** each *(was +15, max 2 — serial OSS creators should score very high)*
- **Recency** (mutually exclusive — apply at most ONE), magnitude **gated on real building** (a "substantial builder" = a non-fork repo ≥ 500★ OR ≥ 10 non-fork repos of real work): most recent push in last 90 days → **+15** if substantial builder, else **+3**; in last 365 days (but >90d) → **+8** / **+2**; dormant (no push in 5+ years / none detected) → **−15**. **Exception: never apply the dormant −15 to a verified founder/CEO.** *(v0.0.8: a recent push to a starless personal repo no longer earns the full +15 — that was the main driver of non-technical founders scoring high on Technical Depth.)*

### Company-flagship OSS bonus (SYSTEM-computed in code, founder rubric)
*Mirrors the Majestic Million bonus: deterministic and post-scoring, keyed on the
resolved `primaryCompanyDomain` (the GitHub enricher only sees the subject's
PERSONAL account and runs before the company is resolved, so a founder whose real
OSS lives in the company **org** — e.g. a founder whose flagship OSS is `apollographql/apollo-client`,
or `hashicorp/terraform` — was never credited for it).*
- Derive the org from the domain (`apollographql.com → apollographql`), look up
  its **top-starred non-fork repo** via the GitHub search API, and award the
  **founder** `githubTopRepoPoints(stars)` (the same uncapped `round(25 × log10(stars))`
  curve). Rule `github_top_repo` (exempt from the +200 clamp); `github.com` source
  → counts toward the **Technical Depth** radar vector. **Founders only, AND only when `technicalFounder === true`** (v0.0.10) — a non-technical founder (designer/business CEO) does NOT get technical credit for OSS their company's engineers wrote.
- e.g. `apollographql/apollo-client` ~19.7k★ → **+107**; `meteor/meteor` ~44.8k★ → **+116**; `hashicorp/terraform` ~48.5k★ → **+117**.
- The LLM is told NOT to award the company-org flagship itself, so this is purely additive (no double-count).

### How a technical founder earns points (and the "Technical Depth" radar vector)
*The "Technical Depth" axis on the credibility radar is the **percentile** of a
profile's summed `technical`-vector points vs. the whole scored population. Rows
are bucketed into `technical` when their citation domain is GitHub / npm /
Stack Overflow / Hugging Face / dev.to / tkmx, or their reason mentions those
(see `credibility-vectors.ts`). So everything below both adds to the founder
score AND drives Technical Depth.*

**HIGH technical depth (what we now reward heavily):**
- **A widely-used OSS project.** Top repo by stars on the uncapped `25 × log10`
  curve — a 10k★ project is +100, a 100k★ project +125. Applies to the subject's
  personal repos AND (in code) their **company's** flagship org repo.
- **Several popular projects.** +20 for each additional 1,000★+ repo (max 3) — a
  serial creator behind multiple 10k★ projects stacks well past +150.
- **A large developer following** (20k+ GitHub followers → +20), **real OSS usage**
  (npm direct dependents up to +50, downloads up to +15; Hugging Face downloads),
  **sustained technical writing** (dev.to up to +18), and **active heavy-LLM use**
  (HN Tokenmaxxing up to +35). These measure impact/usage, not mere presence.

**LOW technical depth (what no longer inflates it):**
- Having a GitHub account (+2), an **old** account (+1), or a **single recent push**
  to a repo with no stars (+3, not +15). Identity + age + a token recent push now
  total ~+6, so "I've had a GitHub since 2011" lands a non-technical founder near
  the middle of the distribution rather than the top.

**Worked examples (the calibration targets that drove v0.0.8):**
| Founder | Before | What changes | After (intended) |
|---|---|---|---|
| A popular OSS author (100k★ project) | 100 | unchanged — impact-driven | ~100 |
| An infra-tools founder (multiple popular projects) | 100 | + company-org bonus (hashicorp) | ~100 |
| **A developer-tools founder** (flagship OSS) | **83** | **+ company-org bonus** (`apollographql/apollo-client` ~+107) | **low 90s+** |
| **DROdio** | **92** | recency +15→+3, id +3→+2, tenure +3→+1 (23 pts → ~7) | **~60th** |

### Product Hunt builder sub-rules (`[producthunt]`)
- Identified maker: **+5** once
- Per launch: **+2** each (cap +20)
- Per PH-featured product: **+3** each (cap +15)
- Top product by upvotes (award once): 100–499 → +5; 500–999 → +15; 1k–4,999 → +30; 5k+ → +50
- Each additional product with 500+ upvotes (max 2): **+10** each

### Hacker News sub-rules (`[hackernews]`)
*Karma = net upvotes across all posts + comments; the single best reputation summary.*
- Identified HN account: **+3** once
- Karma tier (award once): 500–1,999 → +3; 2,000–9,999 → +8; 10,000–49,999 → +15; 50,000+ → +25
- Active poster (≥20 story posts): **+5** once
- Top post by points (award once): 100–499 → +3; 500+ → +8
- **Content analysis (v0.0.9):** the enricher also surfaces a sample of the
  person's longest HN comments. From that CONTENT the model may award (at most one
  each): **individual technical depth** (≤+8, real engineering substance only —
  routes to the Technical vector, distinct from credit for the company they
  founded) and **domain expertise** (≤+6 — routes to Domain). Raw karma/posts
  above stay REACH (GTM vector). Rows whose reason says "technical depth" /
  "domain expertise" are attributed by substance (see `credibility-vectors.ts`),
  not by the word "Hacker News."

### SEC EDGAR / Form D sub-rules (`[sec-edgar]`)
*Form D = the authoritative legal record of a private raise; the founder is a named "related person." All SEC-sourced rows are `authoritative` tier (full weight).*
- **The SEC Form D dollar figures are AUTHORITATIVE and override press-snippet estimates** — they become `totalRaisedUsd` and feed the "Venture raised" rule above (reason cites the SEC figure).
- Being a confirmed related person satisfies the current-founder signal (+10 if not already triggered).
- **IPO / exit (founder):** when the company the subject is a related person on **has gone public** (filed an S-1 and now files 10-K/10-Q), emit the founder "Each distinct exit" (+10) row and set `hadIpo=true`. Authoritative; don't also award it from a press snippet about the same IPO.
- **Investment fund (investor):** when the Form D issuer is a **pooled investment fund** and the subject is a related person, they are a **fund manager / GP** — apply the investor "Active GP / fund manager" (+15) row (and "Partner / Principal" if the firm is named). The Form D **fund size** grounds GP status but is the fund's capital, **not** a founder raise — never feed it into "Venture raised".
- **No double-counting:** capital-raised points still come only from "Venture raised"; the GP/IPO blocks confirm role/outcome and improve accuracy, they don't add separate awards.

### Stack Overflow sub-rules (`[stackoverflow]`)
- Identified account: **+2** once
- Reputation tier (award once): 5,000–24,999 → +3; 25,000–99,999 → +8; 100,000+ → +15

### npm sub-rules (`[npm]`)
*Stars measure intent; downloads measure traffic (inflatable by CI); **dependents measure usage** — other packages choosing to depend on yours is a hard, load-bearing signal of OSS impact.*
- Identified maintainer (≥1 package): **+2** once
- Total monthly downloads (award once): 100k–999k → +3; 1M–9.9M → +8; 10M+ → +15
- **Direct dependents** on top package (award once, via deps.dev): 50–499 → **+5**; 500–4,999 → **+15**; 5k–49,999 → **+30**; 50k+ → **+50**

### Hugging Face sub-rules (`[huggingface]`)
- Identified author (≥1 model): **+3** once
- Total model downloads (award once): 10k–99k → +3; 100k–999k → +8; 1M+ → +15

### Wikidata sub-rules (`[wikidata]`)
- Wikidata entity exists for the subject: **+5** once (notability). Capped to **at most once across Wikipedia + Wikidata combined** (max +5 total, not +5 each).
- A "founder of" / CEO / employer assertion corroborates the founder/operator signal (no extra points; raises confidence).

### OpenAlex sub-rules (`[openalex]`) — research papers
*The enricher already gates on a real footprint (works_count ≥ 3 AND cited_by_count ≥ 50).*
- Identified researcher: **+3** once
- h-index tier (award once): 20–49 → +5; 50–99 → +10; 100+ → +15

### dev.to technical-writing sub-rules (`[devto]`)
*Identity-confirmed published technical writing — direct evidence the person ships
AND reasons about code in public, distinct from passively "having a GitHub account."
A high GitHub account age WITHOUT this kind of public technical output is a weaker
technical-prowess signal than the rest of the rubric implies; these rules let
sustained dev.to writing make up the gap. Maps onto the Technical Depth vector.
The four rules **stack** (distinct facets: presence, volume, quality, recency) but
together **cap at +18** from the [devto] section.*
- Publishes on dev.to with confirmed identity (enrichment fired at all): **+2** once.
- Sustained technical writer (≥5 articles tagged TECHNICAL): **+6** once. Reason
  cites the technical-article count + top tag.
- High-impact article (top article ≥200 positive reactions): **+6** once. Reason
  cites the article title + reaction count.
- Active in the last 12 months (most-recent published within 365 days): **+4** once.

### HN Tokenmaxxing sub-rules (`[hn-tokenmaxxing]`)
*Curated, opt-in leaderboard at <https://tkmx.odio.dev> of active heavy-LLM-user developers. Strong current-technical-depth signal — being listed means the subject is shipping with code-generation tools TODAY, distinct from historical GitHub presence. Maps onto the Technical Depth credibility vector.*
- Listed on the leaderboard: **+10** once
- 28-day total-tokens rank tier (award once): Top 25 → **+10**; Top 10 → **+20**; Top 5 → **+35**
- Reason cites the rank + volume, e.g. *"Ranked #3 on the HN Tokenmaxxing 28-day leaderboard with 30.9B tokens."*

### Prestige / Recognition sub-rules (cross-cutting — Founder AND Investor)
*Third-party RECOGNITION is a real credibility signal distinct from competency.
Scored consistently by the model (a normal breakdown row with a confidence level,
not a code-computed bonus). Emitted into whichever breakdown the honor pertains to
(personal/founder honor → founder; investing honor like the Midas List → investor;
default founder). Distinct honors **stack with NO overall cap**; each individual
honor is awarded **once**.*
- **Tier 1 — elite (+12 to +18):** Thiel Fellowship; Rhodes / Marshall /
  Knight-Hennessy; MacArthur; Nobel / Turing / Fields / ACM Prize; NAE / NAS
  election; national/international academic-olympiad medalist. Top of range for the
  rarest (Nobel/Turing/MacArthur), bottom for Thiel/olympiad.
- **Tier 2 — notable (+6 to +10):** Forbes 30 Under 30; TIME100; Fortune 40 Under
  40; a genuine FEATURE PROFILE of the subject in a tier-1 outlet (WSJ, NYT, Forbes,
  Fortune, The Economist, Bloomberg) — a dedicated article about THEM, not a passing
  quote or a company mention.
- **Tier 3 — minor (+2 to +4):** a regional/industry award; a notable-podcast
  feature; a profile in a smaller/trade outlet.
- **Double-count guard:** prestige is ONLY for recognition with no dedicated rule
  elsewhere. NOT awarded for Y Combinator/accelerator (→ operator), Wikipedia/Wikidata
  notability, or research citations/h-index (→ OpenAlex). One honor, one row.
- **Axis substance (the radar nuance):** when a recognition EVIDENCES a competency,
  the reason NAMES it so it maps onto the right credibility axis and affects the
  radar — e.g. *"WSJ feature on their go-to-market playbook"* (→ GTM), *"profiled for
  scaling the engineering org"* (→ operator). A bare recognition ("Forbes 30 Under
  30") still scores its points but is recognition-only — it has no radar axis by
  design (attribution in `credibility-vectors.ts` leaves it unmapped, NOT lost: it
  counts in the founder/investor TOTAL). Substance phrases (`go-to-market`,
  `scaling the … org`, `technical depth`, `domain expertise`) route via the
  substance-first attribution rules.
- Waterfall: surfaced as the step *"Searching for prestige signals (Thiel Fellow,
  Rhodes, Forbes, Fortune, WSJ…)"*; findings sourced from tier-1 outlets / awarding
  bodies nest under it (see `HOST_TO_STEP` in `eval-steps.ts`).

---

## Investor Rubric
*Several rules are deliberately easy to trigger so a clearly-active investor scores meaningfully even without disclosed deal counts.*

| Rule | Points |
|---|---|
| Per active investment | +1 each (cap +50) |
| Per $1M total deployed (cumulative) | +1 each (cap +100) |
| Per portfolio IPO | +50 |
| Per portfolio acquisition (≥ $100M reported) | +20 |
| Per portfolio acquisition (smaller / undisclosed) | +5 |
| Per portfolio unicorn (private, >$1B) | +30 |
| Partner / GP at a top-tier firm (Sequoia, Benchmark, a16z, Founders Fund, Greylock, Accel, Bessemer, Lightspeed, USV) | +30 |
| Partner / Principal at any other recognized VC firm | +15 |
| Active GP / fund manager (syndicate, search fund, micro-VC) | +15 (once; stacks with Partner/Principal) |
| Publicly identified angel investor | +15 (marquee names (the most famous angels) → +25) |
| Per year of investing experience | +1 each (cap 15) |

### NFX Signal sub-rules (`[nfx]`)
*Structured investor directory — far stronger than press inference. Maps onto the rules above; adds no new point categories.*
- Listed on NFX → emit "Publicly identified as an angel investor" (+15) if not already triggered. If NFX shows a firm + fund size, prefer the "Active GP / fund manager" (+15) / "Partner / Principal" rows.
- NFX **portfolio count (N total)** is the AUTHORITATIVE deal count → use N as the input to "Per active investment" (+1 each, cap +50). Don't also infer a count from press.
- A **claimed** NFX profile → treat NFX-derived rows as `corroborated` (not self-asserted); `authoritative` when the enrichment notes a LinkedIn match.
- "Leads rounds" + check size confirm an active investor (supports the GP rows; no separate points). **Fund size grounds GP status but is never a founder raise.**
- **No double-counting:** NFX improves the accuracy/evidence of the existing investor rules; it doesn't create new categories.

### Neo sub-rules (`neo.com` enricher) — **evidence-only, zero points**
*Neo is a structured investor directory (neo.com, free Bubble Data API, no auth). Identity is a strict LinkedIn-URL match and it only surfaces for profiles Neo flags as VCs. Like NFX, it adds **no new point categories** — it grounds the existing investor rows with higher-confidence inputs and powers investor **badges**.*
- Neo never changes the score directly (no `neo` reference exists in `scoring.ts`). Its facts enter the prompt as Tier-1 enrichment evidence the model may weigh against the existing investor rules; nothing more.
- It populates evaluation columns via `investorFacets()` in `eval-pipeline.ts` (Neo wins over NFX over Claude): `investorStageFocus`, `investorIndustryFocus`, `investorLeadsRounds`, `investorCheckSize`, plus `onNeo` / `neoSlug`.
- **Badges** (investor category, see `badges.ts`): `Featured on Neo`, `Leads Rounds`, stage focus (`Pre-Seed`/`Seed`/`Series A–C`/`Growth-Stage Focus`), and up to 4 `<Industry> Focus` badges.
- **Endorsements:** the enricher reads the endorsement **count** (`numEndorsements`) but not the quote content — that type is private on Neo's public API and the page is a token-gated SPA. Investor profiles deep-link out to `neo.com/investor/<slug>` to read endorsements on Neo. Scraping the quote content (Phase 2) would require a headless browser on a separate background path — not yet built.

---

## Hard checks (consistency)
1. `founderScore` = Σ founder breakdown points
2. `investorScore` = Σ investor breakdown points
3. `combinedScore` = founder + investor
4. Reason numbers must be consistent with the calculation (never write "$83M" when the figure used was $8M).
5. `signalQuality` is metadata — it never blocks scoring. Everything is 0 only when the subject can't be identified as a real person at all.
6. Founder detection is a floor (see above).

## Reason-text style
One clean factual sentence per row, shown to the user. **No math, formulas, or
point totals in the prose** (the points column already shows the number).
Good: *"Raised $201.6M per Stripe's SEC Form D filing."* / *"Partner at Sequoia."*
Bad: *"Raised $8M → +80 (10×8)."*

## Confidence (0–100, per row)
Self-assessed evidence strength, independent of point value:
- **90–100:** multiple independent sources corroborate the exact claim
- **75–89:** one strong primary source + consistent support
- **60–74:** one reasonable source, no corroboration (e.g. a single enrichment)
- **40–59:** inferred from indirect signal
- **0–39:** weak / single ambiguous mention

## Verification tier (per row — drives the weighting in mechanics step 3)
Separate from confidence. Every row also carries a `verification` tier + a
`sources[]` array. **High-value rows (`|points| ≥ 25`) are scaled by tier**;
low-value rows are unaffected (but still set a tier). No score caps — big claims
must *earn* their points through corroboration.

| Tier | Meaning | Weight on high-value rows |
|---|---|---|
| `authoritative` | Official filing/record — SEC EDGAR, gov grant, or the Exa GROUNDED FACTS block | **×1.0** |
| `corroborated` | ≥2 independent third-party sources (not two pages of one outlet, not the subject's own LinkedIn) | **×1.0** |
| `single-source` | One third-party source, no corroboration | **×0.6** |
| `self-asserted` | Appears ONLY in the subject's own LinkedIn / personal site | **×0.25** |

Default when the model omits/garbles it: `single-source`. A row whose only
evidence is the LinkedIn page text MUST be `self-asserted`. This is the anti-
inflation mechanism: writing impressive but unverifiable claims about yourself
caps out at 25% of face value on any high-value row.

## Extracted metrics (structured, for badges; null if unknown)
`companiesFounded`, `totalRaisedUsd`, `exitCount`, `hadIpo`, `hadAcquisition`,
`employeesCount`, `isUnicornFounder`, `ycBatch`, `partnerAtFirm`,
`isAngelInvestor`, `totalDeployedUsd`, `topGithubRepo`, `topGithubRepoStars`,
`onWikipedia`, `ipoMarketCapUsd`, `acquisitionPriceUsd`, `peakValuationUsd`.
*(The last three feed the dollar-weighted `founder_exit` / `founder_valuation`
rules. Investor stage/industry-focus, leads-rounds, and Neo/NFX facets live on
their own evaluation columns, not in `extractedMetrics` — see the Neo/NFX
sub-rules above.)*

## Also emitted
- `signalQuality`: high | medium | low — **display-only metadata.** It does NOT
  gate scoring or the profile (that's the score, via `deriveEvalStatus`). Shown
  in Score Detail only.
- `companyStage`: idea | pre-seed | seed | series-a | series-b | series-c+ | growth | public | acquired | n/a
- `investorStageFocus`: up to 3 stages the subject primarily backs (same enum as
  companyStage); empty array if not an investor / not stated.
- `recommendations`: a 2–3 sentence summary + 5–8 **proposed IRL Festival events**
  the person would want to attend (dinners/office hours/roundtables/happy hours),
  each grounded in their profile and phrased as a concrete event ("An SPC dinner
  with other top-ranked SPC members to…"). Categories: fundraising | hiring |
  intros | tactical | positioning | wellbeing. (Reframed from advice/priorities;
  does not affect point scoring.)

---

## Roadmap — proposed sub-rules for upcoming sources (impact-ranked)

Value rating reflects how much each source should move the score relative to the
others (★ minor → ★★★★★ transformative). Tier-1 sources mostly **ground existing
high-point rules** (raised/exits/IPO) rather than add new points — accuracy, not
inflation. Calibrated against the live builder sub-rules (+2…+15 per source).

### Tier 1 — core accuracy
- ✅ **Exa Research API ★★★★★ — SHIPPED.** Grounded facts (raises, exits,
  outcomes) with citations; no new points — improves accuracy and feeds the
  `authoritative` verification tier. Now live in the Founder/Investor sections.
- ✅ **NFX Signal ★★★★★ (investor) — SHIPPED.** See the live "NFX Signal
  sub-rules" in the Investor Rubric. NB: the implemented form **maps onto the
  existing investor rules** (angel +15 / GP +15 / portfolio→per-investment +1
  each) rather than the original "+3 identified / portfolio-count tier" proposal
  drafted here — the live rules above are authoritative.
- 🟡 **SEC EDGAR v2 ★★★★★ — PARTIALLY SHIPPED.** Done: **Form D fund
  classification** (GP / fund-manager investor signal) + **IPO/exit** detection
  (S-1 + 10-K/10-Q → +10 founder exit). Still to build: **Form ADV** (investor
  AUM tier — propose ≥$100M +10, ≥$1B +20), **8-K/Form 25** (acquisition exits),
  **DEF 14A / Form 3-4-5** (authoritative operator roles + tenure; grounds the
  founder/operator floor, no separate award).

### Tier 2 — broad upgrades
- **GDELT ★★★★** — sustained positive press tier (award once): moderate → +3;
  high-volume favorable coverage → +8. Negative-tone clusters inform `confidence`
  (not negative points). Founder+investor.
- **Libraries.io dependents ★★★★** — upgrades OSS: dependents 100–999 → +5;
  1k–9,999 → +10; 10k+ → +15 (replaces star-only tier as the stronger signal).
- **GitHub social graph ★★★** — member of a recognized org / notable
  co-contributors: +3. (Network corroboration; small.)
- **Book authorship ★★★** — authored a domain book: +5; bestseller / major
  publisher: +10. Founder+investor (domain authority).
- **YouTube ★★★** — channel audience (award once): 10k–99k subs → +3;
  100k–999k → +6; 1M+ → +10 (GTM/distribution).

### Tier 3 — traction & operator
- **App stores ★★★★** — shipped app tier on ratings×volume: 4.0★ w/ 1k+ ratings
  → +5; 100k+ ratings or top-100 category → +12. Strong real-traction signal.
- **DOL H-1B ★★★** — active engineering hiring (sponsorships in last 2y): 1–9 →
  +3; 10+ → +8 (growth proxy).
- **OpenCorporates / Companies House ★★★** — confirmed director/officer roles →
  grounds operator track record + tenure (no separate award; raises confidence).
- **USPTO Patents ★★★** — named inventor: +3; 5+ patents or a cited patent → +8
  (technical/domain depth).
- **USPTO Trademarks ★★** — company holds a registered trademark: +2 (confirms
  real company/brand; corroboration).
- **Domain history (Wayback/WHOIS) ★★** — building ≥3y on the same domain: +3
  (persistence / problem proximity). Pivots inform narrative, not points.

### Tier 4 — thought leadership & community
- **Podcasts (Listen Notes) ★★★** — guest on notable shows: +3; host of a show
  with real audience: +8 (thought leadership / problem proximity).
- **Reddit ★★** — substantive niche-community presence: +2.
- **Meetup/Eventbrite ★★** — organizes a recurring community/event: +5
  (distribution + problem proximity).
- **Social-breadth bundle ★★** — Bluesky/Dev.to/Mastodon/Medium/PyPI: small
  audience/writing tiers, +2…+5 total, capped to avoid double-counting reach.

### Tier 5 — capital & validation
- **Non-dilutive grants ★★★ (★★★★ deep-tech)** — SBIR/STTR/NIH/NSF award:
  +5 each (cap +15); a Phase II / large grant → +10 (validated non-dilutive
  capital + technical credibility). Counts toward founder, distinct from VC raise.
- **USAspending federal awards ★★** (govtech) — material federal contract: +5.
- **FEC donations ★★** — informs wealth-tier/network context for investors
  (low/zero direct points; mostly a corroborating + recommendations signal).
- **Crunchbase ODM ★★** — corroboration only; no independent points.

### Tier 6 — vertical-specific (rare, decisive)
- **Clinical trials / openFDA ★★★★ (health/bio)** — named sponsor/PI on a
  registered trial: +10; FDA clearance/approval for their product: +20.
- **On-chain / crypto ★★★★ (web3)** — deployed mainnet contract / launched token
  with real usage: +10; widely-used protocol: +20 (shipped-product proof).

### Tier 7 — risk / compliance (NOT positive points)
- **OpenSanctions/PEP** — gate: a confirmed hit pauses ranking for admin review
  (no score effect by itself).
- **CourtListener/RECAP** — admin-only "flags to review"; never auto-penalizes
  on a public profile (defamation/accuracy risk). High corroboration bar.

> **Anti-double-counting:** several sources corroborate the *same* underlying
> fact (e.g. SEC S-1 + GDELT + Exa all confirm one IPO). Award the IPO once;
> additional corroboration raises `confidence`, not points. The model must treat
> these as evidence for one rule firing, not multiple rules.

## Known gaps / next versions
- **Score non-determinism (top reliability issue):** the same profile re-scored
  on the same model (Opus, temp 0.2) swings **±50–100 points** run-to-run. For a
  ranking/leaderboard product this is the most important open problem — candidate
  fixes: temperature 0 and/or multi-sample median. Not yet addressed.
- **Capital-raised accuracy (FEAT-01):** now anchored by SEC EDGAR Form D where
  available; non-US / SAFE-only raises still fall back to press estimates.
- **Recall on handle-based sources** (HN/SO/npm/HF) depends on Exa surfacing a
  profile URL; founder self-connect via the claim flow is the planned fix.
- Investor badges (Neo: Featured on Neo / Leads Rounds / stage + industry focus)
  ship, but are **not leaderboard-filterable** — they're absent from
  `BADGE_SQL_PREDICATES` (`leaderboard-badge-sql.ts`). The enricher-source of each
  score row is also not surfaced in the static profile breakdown (only in the live
  waterfall step list); per-row source attribution remains a UI gap.
- Spider-graph vectors (FEAT-02), fit score (FEAT-04), and unfair-advantage copy
  (FEAT-03) are not yet computed — this rubric still produces the founder +
  investor point totals, not per-vector scores.
