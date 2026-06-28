# Founder & Investor Signal Data — Full Roadmap

**Date:** 2026-05-26
**Branch:** `founder-signals`
**Author:** Claude (with DROdio)
**Supersedes/extends:** `2026-05-25-founder-signal-sources-design.md` (wave 1)

## Goal

Pull in **as complete a picture as possible** of every founder and investor, to
make the FounderScore/InvestorScore maximally accurate. Build out **every free /
public data source we can** before engaging any paid vendor. Each source: (a)
emits enrichment facts, (b) gets a scoring-rubric sub-rule weighted by value,
(c) adds a line to the user-facing scoring progress page, and (d) where it
resolves an account handle, emits a "Found you on X: <handle>" line.

## Principles

1. **Free / public first.** Exhaust public records, open APIs, and our own
   scrapers before any paid vendor (Crunchbase full API, PDL, Coresignal, X).
2. **Precision over recall.** A false attribution is worse than a missing one
   (reuse `enrichers/identity.ts` confirmation everywhere a handle is guessed).
3. **Ground, don't guess.** Prefer authoritative records (SEC, gov) and
   citation-grounded extraction (Exa Research) over snippet inference.
4. **Pluggable.** Every source is an `(ctx) => EnrichmentResult` enricher in the
   existing `runEnrichments()` framework. No new infra; raw data rides in
   `evaluations.profile` jsonb; cache in-memory per runtime (à la `yc.ts`).

## Cross-cutting requirements (apply to EVERY source below)

- **Scoring progress page** (`src/lib/eval-steps.ts` `EVAL_STEPS`): each source
  adds a step line in a logical position; phrase it for a human ("Checking
  research papers you've authored"), not the source's brand name.
- **"Found you on X" lines**: any source that confirms a handle/profile feeds
  `foundIdentities` (see `eval-pipeline.ts`) → rendered at the top of the score
  reveal. Extend `extractFoundIdentities` per source.
- **Rubric sub-rule**: add a weighted block to `SCORING_RUBRIC` in `scoring.ts`,
  mirrored into `PRD/scoring-rubric-v0.0.1.md` (now v0.0.2). Weights are
  relative — see the rubric doc's impact-ranked roadmap section.
- **Identity match**: reuse `deriveHandleCandidates` / `nameOverlaps` /
  `textCorroborates` / `handleFromUrls`. Trust an Exa-surfaced profile URL first.
- **Verification**: a `scripts/test-<source>.mjs` smoke test against real people
  incl. a negative control; `tsc` + `eslint` clean; unit-test pure logic.

---

## Impact-ranked build sequence

Ranked by **accuracy lift × breadth ÷ effort**, free-first. Effort: S (<½ day),
M (~1 day), L (multi-day). Value: ★ (minor) → ★★★★★ (transformative).

### Tier 1 — Core accuracy (weakest + highest-point rubric areas; universal)

**1. Exa Research API + `/answer` upgrade** — ★★★★★ · effort M · key: *existing EXA*
Replace "search → highlight soup → Claude guesses" with Exa's **Research API**
(structured JSON + field-level citations) for the weakest, highest-point items:
`totalRaisedUsd`, exits + acquisition values, portfolio outcomes (IPO/acq/
unicorn). Use `/answer` for targeted private-M&A questions ("Did X get acquired,
by whom, for how much?"). Per-field grounding maps onto our `citations[]` +
per-row `confidence`. Not a new point rule — an **accuracy multiplier** on
existing rules. Highest leverage; no new vendor.

**2. NFX Signal — direct scraper** — ★★★★★ · effort M · key: *NFX JWT (refresh)*
Finish the branch's founding purpose: rewrite `enrichers/nfx.ts` to call
`signal-api.nfx.com` directly (drop Apify → free). Biggest structured **investor**
source: portfolio companies, check size, stages, sectors, claimed/leads-rounds,
angel status. Wire into `runEnrichments()`; add investor sub-rule. ToS gray-area
(accepted in original NFX PRD): cache 24h+, don't bulk-scrape, backoff on 429.

**3. SEC EDGAR v2** — ★★★★★ · effort L · key: *none (UA only)*
Extend the existing `sec-edgar.ts` from Form-D-only to:
- **Form D issuer classification** — operating-company (founder raise, current)
  vs **investment fund** (the GP is a related person → confirms GP/fund-manager
  status; `totalOfferingAmount` = **fund size**).
- **Form ADV / IAPD** — registered & exempt advisers → **AUM, # funds, firm**.
- **S-1 / 424B** — a founded or portfolio company that **IPO'd** → grounds the
  +50 IPO rule (founder exit AND investor portfolio outcome).
- **8-K / Form 25** — acquisition by a *public* acquirer; delisting → grounds
  founder exits + investor acquisition outcomes.
- **DEF 14A / Form 3/4/5** — officer/director roles + equity at any SEC filer →
  authoritative **work history + operator** tenure.

### Tier 2 — Broad universal signal upgrades

**4. GDELT — news momentum + sentiment** — ★★★★ · effort M · key: *none*
Global news index: **media volume + tone over time** for person/company →
reputation trajectory + corroboration of exits/raises. Universal.

**5. Libraries.io — package dependents** — ★★★★ · effort S · key: *libraries.io*
How many projects **depend on** their OSS (not just stars/downloads) → real code
impact. Upgrades the existing npm/PyPI builder signal from popularity → reliance.

**6. GitHub social graph** — ★★★ · effort S · key: *existing GITHUB_TOKEN*
Extend `github.ts`: followers/following, org memberships, frequent
co-contributors → network/team quality.

**7. Book authorship — Open Library + Google Books** — ★★★ · effort S · key: *none (Google optional)*
Did they author a book in their domain? → domain authority / thought leadership.
Universal; trivial APIs.

**8. YouTube Data API** — ★★★ · effort S · key: *Google Cloud (YouTube Data v3)*
Channel subscribers / appearance views → audience & distribution (the
under-measured GTM vector). Founder-creators + VC channels.

### Tier 3 — Traction & operator proof

**9. App stores — iTunes Search API (+ Google Play)** — ★★★★ · effort M · key: *none (iTunes)*
Their company's app: ratings, review counts, category rank → real adoption.

**10. DOL H-1B / LCA disclosures** — ★★★ · effort M · key: *none*
Visa sponsorships by their company → hiring velocity + role mix (hard-to-fake
growth proxy).

**11. OpenCorporates / Companies House (UK)** — ★★★ · effort M · key: *OpenCorporates (apply) + Companies House*
Directorships across jurisdictions → structured **work history** without
LinkedIn-vendor ToS risk.

**12. USPTO Patents — PatentsView** — ★★★ · effort S · key: *none*
Inventor patents → technical/domain depth.

**13. USPTO Trademarks — TSDR / open data** — ★★ · effort S · key: *none*
Trademark filings → confirm real company + brand; complements patents.

**14. Wayback Machine (CDX) + RDAP/WHOIS** — ★★ · effort S · key: *none*
Company site first-seen date + evolution → **persistence / "how long grinding on
this problem"** (problem proximity) + pivot detection.

### Tier 4 — Thought leadership & community (problem proximity / GTM)

**15. Podcasts — Listen Notes API** — ★★★ · effort M · key: *Listen Notes*
Appearances + transcripts → stated thesis, **problem proximity**, domain depth.
Founders and VCs.

**16. Reddit — official API** — ★★ · effort M · key: *Reddit app creds*
Niche-subreddit activity, AMAs, comment history → community + problem proximity.

**17. Meetup / Eventbrite** — ★★ · effort M · key: *Eventbrite token (Meetup paid)*
Do they **run** a community/event series? → distribution + problem proximity.
On-brand for Festival.so.

**18. Social-breadth bundle — Bluesky, Dev.to, Mastodon, Medium RSS, PyPI** — ★★ · effort M · key: *mostly none*
Extra reputation/audience/writing signal. Batch them; each is small.

### Tier 5 — Capital & external validation

**19. Non-dilutive grants — SBIR/STTR, NIH RePORTER, NSF, grants.gov** — ★★★ (★★★★ deep-tech) · effort M · key: *none*
Government-awarded grants → non-dilutive capital + **research/technical
validation** that Form D misses.

**20. USAspending.gov — federal awards** — ★★ (vertical: govtech) · effort S · key: *none*
Federal contracts/grants to their company → govtech/defense traction + revenue.

**21. FEC political donations — OpenFEC** — ★★ · effort S · key: *api.data.gov*
Public contributions → wealth-tier proxy + network (esp. investors).

**22. Crunchbase Open Data Map** — ★★ · effort S · key: *Crunchbase Basic (may be discontinued — verify)*
Light free corroboration of company existence/funding. Full Crunchbase API is
the eventual paid decision, NOT now.

### Tier 6 — Vertical-specific (rare but decisive)

**23. Clinical trials + openFDA** — ★★★★ when it fires (vertical: health/bio) · effort M · key: *openFDA via api.data.gov (optional)*
Sponsored trial / FDA submission → gold-standard domain proof for health founders.

**24. On-chain / crypto — Etherscan + ENS** — ★★★★ when it fires (vertical: web3) · effort M · key: *Etherscan*
Deployed contracts / launched token / ENS → shipped-product proof on a public
ledger for crypto founders.

### Tier 7 — Risk / compliance axis (NEW DIMENSION — needs a product decision)

Today the rubric only **adds** points. These introduce negative/gating signal.
**Decision needed:** is risk a (a) silent compliance gate, (b) an admin-only
"flags to review" lane, or (c) negative rubric rows? Recommendation: **(a)+(b)** —
a gate + an admin lane, NOT public negative points (avoids defamation/accuracy
risk on a public profile).

**25. OpenSanctions / PEP screening** — gate · effort M · key: *OpenSanctions hosted*
Sanctions/watchlist/PEP hit → compliance gate before ranking someone.

**26. CourtListener / RECAP** — risk/admin-only · effort M · key: *CourtListener*
Litigation, IP disputes, bankruptcies. **Caveat:** noisy, name collisions,
sensitive → admin-review only, high corroboration bar, never auto-penalize.

---

## API keys to obtain (do in tandem)

**One signup unlocks several:** `api.data.gov` → a single key works for **OpenFEC
(#21)** and **openFDA (#23)** (plus many others). Get it first:
https://api.data.gov/signup/

| # | Source | Where to get the key | Notes |
|---|---|---|---|
| 1 | Exa Research | *(existing `EXA_API_KEY`)* | confirm plan tier includes Research API |
| 2 | NFX | *(existing `NFX_SIGNAL_TOKEN`)* | JWT from a logged-in signal.nfx.com session; refresh if expired |
| 5 | Libraries.io | https://libraries.io/account | free key |
| 6 | GitHub graph | *(existing `GITHUB_TOKEN`)* | — |
| 8 | YouTube Data API v3 | https://console.cloud.google.com → enable "YouTube Data API v3" → create API key | also covers Google Books (#7, optional) |
| 11 | OpenCorporates | https://opencorporates.com/api_accounts/new | apply (free for open-data/public-benefit use) |
| 11 | Companies House (UK) | https://developer.company-information.service.gov.uk/ | free, register app |
| 15 | Listen Notes | https://www.listennotes.com/api/ | free tier |
| 16 | Reddit | https://www.reddit.com/prefs/apps → create "script" app | client id + secret |
| 17 | Eventbrite | https://www.eventbrite.com/platform/api → personal OAuth token | Meetup API now needs paid Pro — skip Meetup if not worth it |
| 21 | OpenFEC | https://api.data.gov/signup/ | the shared api.data.gov key |
| 23 | openFDA | *(same api.data.gov key)* | optional; raises rate limit |
| 24 | Etherscan | https://etherscan.io/apis | free tier |
| 25 | OpenSanctions | https://www.opensanctions.org/api/ | hosted API key (or self-host) |
| 26 | CourtListener | https://www.courtlistener.com/help/api/ | free token after register |

**No key needed** (just a descriptive User-Agent): SEC EDGAR (#3), GDELT (#4),
Open Library (#7), iTunes Search (#9), DOL H-1B (#10), PatentsView (#12), USPTO
TSDR (#13), Wayback/RDAP (#14), Bluesky/Mastodon/Medium-RSS/PyPI (#18),
SBIR/NIH/NSF/grants.gov (#19), USAspending (#20), ClinicalTrials.gov (#23),
ENS (#24).

Store all new keys in `.env.local` (test keys only; gitignored). Each enricher
**degrades gracefully** when its key is absent (like `producthunt.ts`).

## Scoring-progress page plan

`EVAL_STEPS` grows with each source, grouped logically:
- **Identity/web:** LinkedIn → web search → press (existing).
- **Builder:** GitHub → Libraries.io dependents → npm → HF → SO → HN → patents.
- **Founder/funding:** YC → SEC (raises/IPOs/acquisitions) → grants → app-store traction → trademarks.
- **Operator/history:** OpenCorporates → DOL hiring → domain history.
- **Investor:** NFX portfolio → SEC fund size/AUM → 13F.
- **Reputation/reach:** GDELT press momentum → YouTube → podcasts → Reddit → community.
- **Vertical (conditional phrasing):** clinical trials / on-chain.
- **Synthesis:** profile → compute score (+ live scoreboard + "Found you on X" reveal).

Keep `EvalProgress` length-driven (already is). Add "Found you on X" handles for:
GitHub, HN, SO, npm, HF (existing) + Reddit, YouTube, Bluesky/Mastodon/Dev.to,
ENS, Listen Notes host handle.

## Rubric weighting

See `PRD/scoring-rubric-v0.0.1.md` → bumped to **v0.0.2** with an impact-ranked
"upcoming sources" section: each source gets a value rating + proposed point
tiers, calibrated against existing sub-rules (builder sources are +2…+15;
authoritative funding/exit signals are higher). Tier 1 sources mostly **ground**
existing high-point rules rather than add new points.

## What stays OUT (until public sources exhausted)

Paid vendors: Crunchbase full API, PitchBook, People Data Labs, Coresignal,
Harmonic, Specter, X/Twitter API. LinkedIn-scraper vendors (ToS/legal risk).
AngelList/Wellfound (no clean API + NFX overlap — see prior conversation).

## Verification (per source) & sequencing note

Build + ship **one source at a time** (each independently verifiable, like wave
1). After each: smoke test against real subjects + negative control, tsc/eslint
clean, journal entry, commit, push to PR #25. Re-score a known profile (e.g. a
public founder) after Tier 1 lands to sanity-check score movement.
