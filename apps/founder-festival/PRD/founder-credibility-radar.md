# Branch: `founder-credibility-radar` — Founder Credibility Radar (FEAT-02)

Phase 1 of the post-customer-feedback credibility work: a founder-credibility spider/radar
graph on the profile, showing depth across five vectors (percentile-ranked vs the
population) with a per-axis drill-down to the raw evidence. Built autonomously;
full design + judgment calls in
`docs/superpowers/specs/2026-05-26-founder-credibility-radar-design.md`.

## Progress Update as of 2026-05-26 08:33 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the **investor** credibility radar (5 vectors: Portfolio Scale, Exits &
Outcomes, Firm Standing, Experience, Capital Deployed) using the same
deterministic attribution on `breakdown.investor`. The profile now shows
whichever dimension scored HIGHER by default, with a Founder/Investor **toggle**
when the person scored on both. "ROI" deliberately excluded (not public).

### Detail of changes made:
- `credibility-vectors.ts`: investor vector keys/labels + `attributeInvestorRow`
  + `bucketInvestorByVector` + `rawInvestorVectorPoints` + `investorRows`;
  generic `bucketRows`/`attributeWith` shared by both dimensions. (Founder
  exports unchanged → founder tests still green.)
- `credibility.ts`: `getCredibilityRadars(breakdown)` → `{ founder, investor }`;
  one population pass builds both distributions.
- `CredibilityRadar.tsx`: `peerLabel` prop (legend "typical founder/investor").
- `CredibilityRadarSection.tsx` (new): Founder/Investor toggle, default = dominant.
- `profile/page.tsx`: renders both, default to higher score.
- `tests/lib/credibility-vectors.test.ts`: +investor attribution tests (17 total).

### Potential concerns to address:
- **Capital Deployed is a dead axis** — no public $-deployed data, sits at "no
  direct signal" (~50) for everyone. Drop to 4 investor axes if it reads as noise.
- Investor population (~30) is smaller than founders → percentiles skew high/coarse.

## Progress Update as of 2026-05-26 08:26 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a scoring bug (reported on Riley Chen): a founder hosted on a
platform (linkedin.com, MM rank 6) was earning the Founder Majestic Million
"company in the MM table" bonus for the PLATFORM's domain rank, not their own
company. Added a platform/host/press/aggregator denylist to
`extractCandidateDomains` so those domains are never matched against the
Majestic Million table. Regression test added. (Investor-radar build is also
in progress — `credibility-vectors.ts` now has investor vectors; consumers next.)

### Detail of changes made:
- `src/lib/exa.ts`: `PLATFORM_DOMAINS` denylist + `isPlatformDomain()`;
  `extractCandidateDomains` skips social/code/reference/aggregator/press/search
  hosts (and subdomains). Errs toward excluding — a false top-rank MM match is a
  +100 catastrophe; a missed company bonus still scores via role/raise/exits.
  List is tunable config.
- `tests/lib/exa.test.ts`: regression test (linkedin/github/press/news.ycombinator
  excluded; real company domains kept).

### Potential concerns to address:
- **Fix applies GOING FORWARD.** Existing profiles (incl. Riley Chen) keep their stale
  breakdown — the bad MM points stay in their stored `founderScore` until
  re-scored. Recommend a bulk re-score of affected profiles (those with an MM row
  citing a platform domain) when convenient; NOT auto-run (costs Exa+Claude).

## Progress Update as of 2026-05-26 08:12 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Polish on the founder radar per DROdio review: widened the SVG viewBox
(300×310 → 380×300, recentered) so the left/right axis labels (GTM, Traction)
no longer clip; replaced the discrete "+N" point numbers in the evidence
drill-down with a proportional weight BAR (perceptual sqrt scale, no number
shown — conveys weight without exposing the raw value); added cursor-pointer +
hover highlight to the vector rows so they read as clickable.

### Detail of changes made:
- `src/components/CredibilityRadar.tsx`: viewBox/cx/cy/R recentered;
  `weightPct()` bar replaces `+points` in evidence; vector list buttons get
  `cursor-pointer` + hover bg.

### Potential concerns to address:
- **Investor radar feasibility (assessed):** 30 investor profiles (vs ~58+
  founders) — enough to draw, but percentiles coarser. Data supports ~4–5
  vectors: Portfolio Scale (# investments), Exits & Outcomes (IPO/unicorn/acq),
  Firm Standing (GP/Partner), Experience (years); Capital Deployed is thin.
  **"ROI / $ returned" is NOT public** — must be proxied via portfolio outcomes,
  never labeled ROI. Awaiting DROdio go-ahead on vectors before building.

## Progress Update as of 2026-05-26 08:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the credibility radar end-to-end. Deterministic attribution: each existing
founder `breakdown` row is mapped to one of five vectors (Technical, Traction,
Operator, Domain, GTM) by source-URL domain then reason keywords, summed, and
percentile-ranked (mid-rank → median = 50 on every axis). Renders as the
DROdio-chosen "Option A / Classic" radar on the profile, above the score table,
with a click-to-expand evidence panel. Pure logic is unit-tested (12 tests);
verified rendering on real profiles (Taylor Brooks, Morgan Diaz, Jamie Patel, Alex Kim)
with sensible differentiation (designer vs engineer founders look different).

### Detail of changes made:
- `src/lib/credibility-vectors.ts` — PURE: `attributeRow`, `bucketByVector`,
  `rawVectorPoints`, `percentileOf` (mid-rank), vector keys/labels. Attribution
  maps are config (easy to retune the borderline calls).
- `src/lib/credibility.ts` — `getCredibilityRadar(breakdown)`; population
  distribution queried once + cached in-memory (5-min TTL).
- `src/components/CredibilityRadar.tsx` — Option-A SVG (gold polygon + dashed
  median pentagon at 50) + drill-down evidence panel.
- `src/app/(authed)/profile/page.tsx` — "Founder Credibility" section, shown only
  when `founderScore > 0`, above the ScoreTable.
- `tests/lib/credibility-vectors.test.ts` — 12 passing tests.
- `/credibility-preview` page (visual mockup A/B/C) is UNTRACKED on purpose —
  throwaway; delete before merge.

### Potential concerns to address (for DROdio review):
- Borderline vector attributions (HN→GTM, Majestic Million→GTM, YC→Operator,
  Wikipedia→Domain) — judgment calls, all in the config tables; retune freely.
- Domain vector is data-thin: one +5 notability row can swing a founder ~42→~92
  percentile. Honest but coarse; improves as patents/publications land.
- Percentiles are relative over a small population (~58) and will shift as more
  founders are scored. Drill-down always shows the absolute evidence too.
- The radar inherits the score's ±50–100 run-to-run non-determinism — a good
  reason to finally pin scoring (temp 0 / multi-sample). Not done here.
- Phase 2 (Fit Score / FEAT-04) and Phase 3 (Unfair Advantage / FEAT-03) are not
  built.
