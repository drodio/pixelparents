# Founder Credibility Radar (FEAT-02) — Design

**Date:** 2026-05-26
**Author:** Claude (built autonomously while DROdio was away; every judgment call
is flagged below for review)
**Source PRD:** Festival.so Founder Profile & Scoring Platform Improvements v0.2
(post-stakeholder feedback), FEAT-02 "Technical Depth Score — Multi-Vector Spider Graph"

## Goal

Show a founder's credibility as depth across five vectors on a radar/spider
graph, scannable in ~10 seconds, with the ability to drill into the raw evidence
behind each vector ("can this founder go five levels deep?"). The stakeholder's ask.

This is **Phase 1 only** — the radar. FEAT-04 (Fit Score) and FEAT-03 (Unfair
Advantage) are explicitly deferred to later phases.

## The five vectors

Chosen for **investor meaning × data we actually have** (grounded in the live
`SCORING_RUBRIC`):

| Vector | Data backing | Strength |
|---|---|---|
| **Technical Depth** | GitHub, Stack Overflow, npm, HuggingFace, OpenAlex | 🟢 strongest |
| **Traction** | SEC Form D raises, exits/IPOs, Product Hunt, profitability, unicorn | 🟢 strong |
| **Operator** | founder/exec roles, YC, co-founders, tenure | 🟢 good |
| **Domain Expertise** | research/h-index, publications, patents, notability | 🟡 thin today |
| **GTM / Distribution** | Majestic Million domain rank, Product Hunt, Hacker News | 🟡 medium |

Naming decisions vs the PRD's suggestions:
- "PMF" → **Traction** (we infer shipped-and-worked proxies; we don't see real
  revenue/retention, so PMF would over-promise).
- "Problem Proximity" (a stakeholder ask) is **not** a vector — it's the Fit Score (FEAT-04,
  Phase 2), a cross-cutting AI judgment rather than a data-volume axis.

## How a vector is computed (the important part)

**Deterministic attribution, NOT an LLM guess.** We already produce a founder
`breakdown` — one row per fired rule, each with `{ points, reason, sources[] }`.
We map each row to one vector and sum:

1. **Attribute** each row (`attributeRow`): match the citation-URL domain first
   (github.com → technical, sec.gov → traction, …), then fall back to keyword
   rules on the reason sentence (highest-priority first, so "raised $20M" beats
   "founder").
2. **Sum** points per vector, floored at 0 (`bucketByVector`).
3. **Percentile-rank** the founder's per-vector total against the whole scored
   population using a **mid-rank** percentile (ties share the midpoint).

**Why deterministic:** the score already swings ±50–100 run-to-run; asking the
model for five more numbers would add five more noisy outputs. Aggregating the
existing rows keeps the radar exactly as stable as the score, and the drill-down
evidence is free (it's the rows already attributed to that vector).

**Why mid-rank percentile:** the **median is 50 on every axis by construction**,
so the radar's dashed "typical founder" ghost is a clean regular pentagon at 50,
and a founder's polygon reads instantly as above/below the field per axis. Ties
at 0 (e.g. a vector most founders have no signal for) land at 50 — the honest
"typical" position, not an unfair floor.

### ⚠️ Judgment calls to review (borderline attributions)

These are config in `credibility-vectors.ts` (the `SOURCE_DOMAIN_RULES` /
`REASON_RULES` tables) — trivial to change:

- **Hacker News → GTM** (community reach). Could argue Technical.
- **Majestic Million domain rank → GTM** (distribution). Could argue Traction.
- **Y Combinator → Operator** (pedigree/validation). Could argue Traction.
- **Wikipedia/Wikidata notability → Domain**. Weakest fit; notability isn't
  cleanly any one vector.

## Normalization & thin-data — limitations (read these)

- **Percentile is relative**, and the population is small (~58 scored profiles),
  so percentiles are coarse and will shift as more founders are scored. This
  matches the existing leaderboard-percentile UX, and the drill-down always shows
  the **absolute** evidence (e.g. "8.1k★ GitHub").
- **Domain is data-thin**: most founders have 0 raw domain points, so a single
  +5 notability row can jump a founder from ~42nd to ~92nd percentile. Honest but
  coarse; improves as patents/publications sources land.
- **`coverage` flag**: a vector with zero attributed rows is labeled "no direct
  signal" and its drill-down explains it'll fill in (it still plots at its
  percentile — typically near 50 — rather than a misleading 0).
- **Determinism caveat**: the radar inherits the score's ±50–100 non-determinism.
  A good reason to finally pin scoring (temp 0 / multi-sample median) — noted, not
  done here.

## Visual (chosen: Option A "Classic")

Gold filled polygon over a dashed grey "typical founder" pentagon (the 50th-pct
ring). Faint grid + spokes. Clickable axis labels + a vector list; clicking any
vector opens a drill-down panel listing its evidence rows (`+points · reason`).
DROdio picked this over Option B (glow) and Option C (radial bars) from a live
mockup at `/credibility-preview` (throwaway page, deleted before merge).

## Architecture

- `src/lib/credibility-vectors.ts` — **pure**: vector keys/labels, `attributeRow`,
  `bucketByVector`, `rawVectorPoints`, `percentileOf`. Unit-tested
  (`tests/lib/credibility-vectors.test.ts`, 12 tests).
- `src/lib/credibility.ts` — data access: `getCredibilityRadar(breakdown)` returns
  the five `RadarVector`s; population distribution is queried once and cached
  in-memory (5-min TTL, same low-signal/code exclusion as `computePercentile`).
- `src/components/CredibilityRadar.tsx` — client component, the Option-A SVG +
  drill-down.
- `src/app/(authed)/profile/page.tsx` — renders a "Founder Credibility" section
  (only when `founderScore > 0`) above the score breakdown table.

## Investor dimension (added)

Same machinery on `breakdown.investor`, five vectors:
- **Portfolio Scale** (# investments) · **Exits & Outcomes** (portfolio
  IPO/unicorn/acquisition) · **Firm Standing** (GP/Partner/angel) ·
  **Experience** (years) · **Capital Deployed** ($ deployed / fund size).
- "ROI / $ returned" is intentionally NOT a vector — it isn't public; outcomes
  is the realizable proxy.
- The profile shows **whichever dimension scored higher by default**, with a
  Founder/Investor toggle when the person scored on both (`CredibilityRadarSection`).
  Peer-label in the legend switches ("typical founder" / "typical investor").

Investor-side caveats (verified on the 30 scored investors):
- Population is smaller (~30 vs ~58 founders) → percentiles skew high and coarse.
- **Capital Deployed is currently a dead axis** — no public $-deployed data, so
  it sits at "no direct signal" (≈50) for essentially everyone. Candidate to drop
  to a 4-axis investor radar if it reads as noise. Kept for now per "see how it
  looks with five."

## Scope / non-goals

- Phase 1 = radar only. **Deferred:** Fit Score (FEAT-04), Unfair Advantage
  (FEAT-03), investor-side radar, caching the per-vector subtotals on the eval row
  (recompute-from-breakdown is fine at this population size).

## Verified

- 12/12 unit tests pass; `tsc --noEmit` clean on the new files.
- Renders at HTTP 200 on real profiles. Sample results show meaningful
  differentiation: a designer-founder Technical 39 / Operator 87 / GTM 99 vs
  an engineer-founder Technical 97 / GTM 96 — exactly the
  engineer-vs-operator signal the team wanted.
