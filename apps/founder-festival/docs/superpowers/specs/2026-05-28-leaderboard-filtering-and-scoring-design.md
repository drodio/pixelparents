# Leaderboard Filtering + Founder-Score Outcome Weighting — Design Spec

- **Date:** 2026-05-28
- **Branch:** `leaderboard-filtering-and-scoring`
- **Status:** Design pending user review.

## Motivation

User feedback from Anelya Grant (investor, found us via the PEF network):

> "What I'd love to see is better filtering by stage and traction signals, not
> just background. How come I landed between founder of GitLab and Instacart —
> that baffles me — they both took their companies public… I did not."

Two distinct problems:

1. **Filtering** — the leaderboard has only name/company text search and three
   role tabs. Investors doing diligence want to slice by company **stage** and
   **traction/outcome**, not just rank.
2. **Ranking legibility** — a founder with no exit can rank *between* two
   founders who took companies public. This is a scoring-design bug (below),
   and the ranking gives no visible reason, so it reads as "baffling."

This spec covers both, plus exposing the filtering through the public API.

---

## Root cause of the "baffling" ranking

Two rubric rules in `src/lib/scoring.ts` are wildly out of balance:

- **`venture_raised`**: `max(1, floor(totalRaisedUsd / 1_000_000))` — **+1 point
  per $1M raised, uncapped** (exempt from the ±200 per-item clamp).
- **Each exit (acquisition *or* IPO)**: a **flat +10** (plus a separate +10 S-1
  exit bonus from the SEC EDGAR path).

So raising money out-scores *actually exiting* by ~15×. A founder with a large
raise but no exit can land numerically between two founders who IPO'd — exactly
Anelya's sandwich. The fix is to score exits on the same dollar scale as raises.

---

## Part 1 — Leaderboard filtering

### UI: faceted sidebar (chosen from 3 mockups)

A left **faceted sidebar** (Crunchbase-style: checkboxes, multi-select pills,
range slider) with the ranked results to its right. On mobile it collapses to a
**filter drawer** triggered by a button. Chosen over a pill-bar (doesn't scale)
and a filter-popover (less at-a-glance for power users).

**Role folds into the sidebar.** The current top tabs (Combined / Founder /
Investor) are removed and replaced by a **Role** facet (Founder / Investor /
Both). "Both" = the old Combined view.

### V1 facet set — data we already store (ships now)

| Facet | Control | Backing data |
|---|---|---|
| **Stage** | multi-select | `evaluations.company_stage` (enum: idea, pre-seed, seed, series-a, series-b, series-c+, growth, public, acquired) |
| **Outcome / Traction** | multi-select | `profile.extractedMetrics`: `hadIpo`, `hadAcquisition`, `isUnicornFounder` (and `profitable` once extracted — see note) |
| **Capital raised** | range slider, **$50K → $1B+** | `profile.extractedMetrics.totalRaisedUsd` |
| **Badges** | multi-select | existing `computeBadges()` ids (YC alum, VC partner, angel, top GitHub, …) |
| **Role** | single-select (Founder / Investor / Both) | `founder_score` / `investor_score` > 0 |

> "Profitable" is referenced in the rubric (+10) but not currently surfaced in
> `extractedMetrics`. Treat the Profitable outcome chip as fast-follow unless we
> add the flag in this work.

### Fast-follow facets — need new extraction (deferred)

- **Industry / vertical**, **Geography (company HQ)**, **Founded year**. We
  store *none* of these today (the only geo we keep is the scorer's request IP
  location, not the company's). Each needs a new `extractedMetrics` field +
  backfill, so they come after V1.
- **Team size** (`employeesCount`) is available today and cheap to add; include
  as an optional V1 facet if desired, otherwise group with fast-follow.

### Data access

Filters compile to a SQL `WHERE` over `evaluations`:

- Scalar columns directly: `company_stage IN (...)`, score thresholds for role.
- JSONB extracted metrics via `profile -> 'extractedMetrics' ->> 'key'`, cast to
  numeric/bool: e.g. `(profile->'extractedMetrics'->>'totalRaisedUsd')::bigint >= :raised_min`,
  `(profile->'extractedMetrics'->>'hadIpo')::boolean = true`.
- The existing base gate stays (`signal_quality != 'low'`, `source != 'code'`,
  `hidden_at IS NULL`, test-handle exclusions).

**Badges are derived** (`computeBadges()` runs in app code, not stored). Two
options, pick at implementation time:

- **(a)** Reproduce each badge's predicate as a SQL clause (badges are derived
  from the same `extractedMetrics`/`mmHits`, so this is mechanical). Preferred —
  keeps filtering in one SQL pass.
- **(b)** Persist a `badge_ids text[]` column on `evaluations`, populated during
  scoring, and filter with `&&`. More work, but makes badges first-class and
  indexable. Reach for this only if (a) gets unwieldy.

Index `company_stage`; add a GIN index on `profile` if JSONB filters are slow.

### Shared filter spec + API (single source of truth)

Define one `LeaderboardFilter` type and a `parseLeaderboardFilter(searchParams)`
helper in `src/lib/leaderboard.ts`. **Both** the server component (UI) and the
public API route call the same parser + the same `getLeaderboard(filter)` query
builder. The UI is just one client of the filter layer.

New endpoint, consistent with the existing `/api/v1/` key-authed surface
(`Authorization: Bearer sk_live_…`, snake_case params, see
`2026-05-26-founder-score-api-design.md`):

```
GET /api/v1/leaderboard
```

| Param | Type | Notes |
|---|---|---|
| `role` | `founder` \| `investor` \| `both` | default `both` |
| `stage` | csv of stage enums | e.g. `series-a,series-b,growth` |
| `outcome` | csv of `ipo,acquired,unicorn` | AND across? **OR within the facet** (matches any) |
| `raised_min` | int (USD) | floor; min surfaced in UI = 50_000 |
| `raised_max` | int (USD) | optional upper bound |
| `badge` | csv of badge ids | OR within facet |
| `sort` | `founder` \| `investor` \| `combined` | default mirrors `role` |
| `limit` | int | default 50, max 100 |
| `cursor` | opaque | keyset pagination (score, id) |

Response: the same curated row shape the API already returns elsewhere
(**excluding** the raw `profile` blob, per the API spec's PII/margin rule) plus
the fields needed to render a row (name, scores, company, badges, stage,
outcome flags). Free cached read; rate-limited per key.

Semantics: **OR within a facet, AND across facets** (standard faceted search).
Document this in the developer guide.

---

## Part 2 — Scoring: weight exits like dollars raised

### Rule change

Add a rule **`founder_exit`** that scores an exit by its dollar value on the
**same +1-per-$1M, uncapped** scale as `venture_raised`:

- **Acquisition** → acquisition / purchase price in USD.
- **IPO** → **market cap at IPO** (the valuation public markets assigned, e.g.
  GitLab ≈ $11B). *(Chosen over IPO proceeds: it's the headline outcome figure
  investors cite and the truest measure of exit size.)*
- Per-exit points: `max(1, floor(exitValueUsd / 1_000_000))` — sub-$1M exits
  floor to 1 point, mirroring raises.
- Add `founder_exit` to `UNCAPPED_UPPER_RULES` alongside `venture_raised`.

This **replaces** the flat `+10`-per-exit rule and the SEC S-1 `+10` exit bonus.
The S-1 path still *detects* the IPO and should now populate the IPO market-cap
figure instead of awarding a flat bonus.

### Raise floor (explicit)

Any **detected** raise under $1M counts as $1M = **1 point**
(`max(1, floor(...))`). This is already the formula's behavior; we state it
explicitly so it isn't "optimized away," and so it stays consistent with the
new exit rule. Note: the floor applies only when a raise is actually detected —
a `$0` / unknown raise awards nothing.

### Keep fundraising linear/uncapped (for now)

Per user direction, we are **not** log-scaling or capping `venture_raised` in
this pass. Exits simply join it on the same linear scale. (Log-scaling /
normalization is captured as a future item below.)

### New data: exit dollar values

`extractedMetrics` currently has only booleans (`hadIpo`, `hadAcquisition`).
Add value fields, e.g.:

- `ipoMarketCapUsd: number | null`
- `acquisitionPriceUsd: number | null` (sum if multiple)

Extraction sources: SEC S-1 / first post-IPO market cap for IPOs; press /
Crunchbase-style figures for acquisitions. These feed `founder_exit`.
Evidence-weighting still applies — a self-asserted exit value is down-weighted
(0.25×) vs. a corroborated/authoritative one (1.0×), same as today.

**Backfill:** existing rows need re-extraction + re-score to populate exit
values and recompute scores. Use the existing rescore tooling
(see `2026-05-26-rescore-all-design.md`).

---

## Consequences & concerns (surface these now)

- **Scores get large and exit-dominated.** A $10B IPO yields ~+10,000 points, so
  public-company founders will sit far above everyone, and the score becomes
  effectively an "outcome size" ranking. This is the *intended* effect for
  diligence, but the raw numbers may look odd in the UI. Likely a follow-up:
  decide whether to display a normalized/percentile score while keeping the raw
  score for ordering.
- **Filter floor ($50K) vs scoring floor ($1M) intentionally differ.** Filtering
  is about *finding* people; scoring is about *ranking*. A $50K-raised founder is
  findable via the filter but contributes only 1 traction point.
- **Backfill cost.** Re-scoring all rows to populate exit values costs LLM/Exa
  spend; run it as a controlled batch, not inline.
- **Badge filtering approach** (SQL predicate vs stored column) is left as an
  implementation decision; default to the SQL predicate.

## Out of scope (recommended future work)

- **"Why ranked here" inline breakdown** (fix #4 from brainstorming): surface
  each row's top 2–3 score drivers in the leaderboard list / on hover, sourced
  from `score_items`. Directly addresses the "baffling" legibility complaint;
  deferred from V1 but recommended next.
- Industry / geography / founded-year extraction + facets.
- Score normalization / log-scaling revisit.
- "Profitable" outcome extraction + chip.

## Open questions / assumptions

- Exact API param names assume snake_case to match `/api/v1/score`. Confirm at
  plan time.
- Multiple acquisitions: assume we **sum** acquisition prices into the exit
  value. Confirm if per-exit treatment is preferred.
