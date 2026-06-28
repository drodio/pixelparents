# API v1 Capability Upgrade — Full Public Profile Exposure

**Date:** 2026-06-05
**Branch:** `api-public-profile-expand`
**Status:** Design approved, pending spec review

## Goal

Make the public Founder Festival API (`/api/v1/*`) substantially more powerful by
exposing all of the public data shipped since the API was last built, and rewrite
the `/developers` documentation so a developer or AI agent can fully understand
what the API can do.

## Guiding principle

> The API returns **everything a non-owner (anonymous) viewer sees on a profile or
> the leaderboard — and nothing more.**

Hard rules (non-negotiable):

- **No PII.** Never expose email addresses, phone numbers, raw Clerk identity, the
  enriched `profile`/`exaGrounding` blobs, request IPs, or operator/CSV-imported
  contact data.
- **No owner-private data.** Respect `recommendationVisibility` — owner-marked-private
  priority items (and a privately-marked summary) must not appear in the API.
- **No operator-imported location.** Location is exposed only when an owner self-set
  it on a high-confidence claim (exactly what the profile page renders).

## Scope

In scope (expanded 2026-06-05 — owner approved full "option B"):

1. Enrich the `score` payload into a full public-profile payload (incl. the
   credibility radar and the founder/investor matrix, with verbose evidence).
2. Close the existing privacy leak on `current_priorities` / summary.
3. Enrich the `leaderboard` payload (status + canonical industries) and
   verify/document the industry filter.
4. **New endpoints:**
   - `GET /api/v1/search` — search scored people by name/company (public rows only).
   - `GET /api/v1/events` + `GET /api/v1/events/{slug}` — published events, public
     fields only (no host email, no applicant PII).
   - `GET /api/v1/industries` — the canonical industry taxonomy (slugs + labels).
5. Rewrite `/developers` docs: the agent guide markdown and the page UI.
6. Unit tests for the pure payload builders and the new endpoints' shaping logic.

Out of scope (deferred):

- Location on leaderboard rows (needs a join the UI query doesn't do today; lower
  value than on the per-person score lookup).

## Current public API (baseline)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/resolve` | name (+company) → ranked LinkedIn candidates |
| `GET /api/v1/score` | free cached score lookup by `linkedin_url` |
| `POST /api/v1/score` | cache hit (free) or paid fresh scoring (`mode: score_if_needed`) |
| `GET /api/v1/credits` | API-key credit balance |
| `GET /api/v1/leaderboard` | paginated public leaderboard (keyset cursor, facet filters) |

`resolve` and `credits` are unchanged by this work.

## 1. `score` payload — full public profile

File: `src/lib/api/score-payload.ts` (`buildScorePayload` is pure; `fetchScorePayload`
gathers from the DB). All additions are in snake_case, consistent with the existing
shape.

### Existing fields (unchanged)
`linkedin_url`, `full_name`, `first_name`, `last_name`, `company_name`, `claimed`,
`signal_quality`, `scores.{overall,founder,investor}` (each `{score, percentile}`),
`founder_rows`, `investor_rows`, `what_you_likely_need`, `current_priorities`,
`scored_at`, `cached`, `outcome`, `cost`.

### New fields

- `profile_href` — canonical Festival profile URL (string).
- `company_url` — company website link (string | null).
- `avatar_url` — `users.clerkImageUrl`, **only** for a high-confidence claim; else null.
- `location` — `{ city, region, country }` from a high-confidence claim's self-set
  values (`users.city/region/country`, first-non-blank across high-confidence claim
  rows, mirroring `profile/page.tsx:419-426`); `null` when no high-confidence claim
  has set it. Operator/CSV `subject_*` fields are **never** used.
- `founder_status` / `investor_status` — `"current" | "past" | "never" | null`
  (`evaluations.founderStatus` / `investorStatus`).
- `canonical_industries` — `string[]` taxonomy slugs (`evaluations.canonicalIndustries`).
- `badges` — `string[]` of badge ids with `status != "rejected"` (same derivation as
  the leaderboard payload).
- `investor` — investor focus block (all public, structured only — no free-text rawText):
  ```
  investor: {
    stage_focus: string[],        // evaluations.investorStageFocus
    industry_focus: string[],     // evaluations.investorIndustryFocus
    leads_rounds: boolean | null, // evaluations.investorLeadsRounds
    check_size: { min_usd: number | null, max_usd: number | null } | null
  }
  ```
- `neo` — `{ on_neo: boolean, slug: string | null }` (`evaluations.onNeo` / `neoSlug`).
- `credibility` — the spider/radar graph for both dimensions:
  ```
  credibility: {
    founder:  RadarAxis[],   // 5 axes: technical, traction, operator, domain, gtm
    investor: RadarAxis[]    // 5 axes: portfolio, outcomes, firm, experience, capital
  }
  // RadarAxis = { key, label, axis_label, score /*0-100 percentile*/, coverage, evidence: [ { points, reason } ] }
  ```
  Computed via the existing `getCredibilityRadars(breakdown)` in `src/lib/credibility.ts`
  (deterministic, derived from public breakdown rows percentiled against the scored
  population). Each dimension is present only when that dimension has signal (mirror the
  profile page's `showFounderRadar` / `showInvestorRadar` gating); otherwise the
  dimension is `null`.
- `matrix` — most-like-you / most-complementary / least-like-you, for both dimensions:
  ```
  matrix: {
    founder:  { similar: MatrixMatch[], complement: MatrixMatch[], opposite: MatrixMatch[] } | null,
    investor: { similar: MatrixMatch[], complement: MatrixMatch[], opposite: MatrixMatch[] } | null
  }
  // MatrixMatch = { full_name, profile_href, avatar_url, display_score }   (up to 5 each)
  ```
  Computed via `computeMatrix()` + `getMatrixCandidates()` in `src/lib/founder-matrix.ts`.
  **Drop the internal `evalId`** from the API shape — key off `profile_href`. A dimension
  is `null` when its vector has no signal (same gate as the radar). Reuses the existing
  5-minute population cache in `founder-matrix.ts`, so cost stays bounded.

### Performance decision

Everything is **on by default**, including the matrix. The matrix is the only heavy
piece (it ranks against the whole scored population); the existing 5-minute in-memory
population cache (`founder-matrix.ts` `CACHE_TTL_MS`) makes it affordable. A future
`include`/`fields` param can be added if call volume warrants it — not built now.

## 2. Privacy fix — `current_priorities` / summary

Today `fetchScorePayload` returns all `recommendations.items` as `current_priorities`
and the summary without consulting `recommendationVisibility`, so owner-marked-private
items leak through the API. Fix: load the `recommendationVisibility` rows for the
evaluation and drop any priority item whose `itemId` is marked private (a row's presence
= private). If the summary supports a private flag, hide it too — **verify the exact
summary-privacy model during implementation** by reading `profile/page.tsx:489-496` and
the visibility table usage; match whatever the non-owner profile view does.

## 3. `leaderboard` payload

File: `src/lib/api/leaderboard-payload.ts` + `src/lib/leaderboard.ts`.

Add to `LeaderboardApiRow`:

- `founder_status` / `investor_status` — already on `LeaderboardRow` (cheap).
- `canonical_industries` — `string[]`; add `canonicalIndustries` to the `LeaderboardRow`
  select if not already present.

Verify & document the existing filter params on `GET /api/v1/leaderboard`
(`parseLeaderboardFilter`): `sort` (`combined|founder|investor`), `limit` (1..100),
`cursor`, and `industry` (confirm the parser accepts it from the UI; if so it is already
wired and just needs documenting).

Location on leaderboard rows is **deferred**.

## 4. `/developers` documentation rewrite

- `src/lib/developers/agent-guide.ts` — rewrite the copy-paste agent markdown to
  document every new field, the radar + matrix blocks, the leaderboard filters, and
  richer example tasks. Keep the "NEVER embed a real key" placeholder discipline.
- `src/app/(authed)/developers/page.tsx` — improve the page: a capabilities overview,
  a full field reference table, and an example JSON `score` response so a developer/agent
  immediately understands the surface area.

## 5. Testing

Pure-function unit tests (no DB needed):

- `buildScorePayload`: new fields present and correctly shaped; `location` null when no
  high-confidence claim; `avatar_url` null when unclaimed; private priorities filtered
  out; `credibility`/`matrix` dimensions null when no signal; `evalId` absent from
  matrix entries.
- `buildLeaderboardPayload`: `founder_status`/`investor_status`/`canonical_industries`
  present; badges still exclude rejected.

Where a builder currently takes already-gathered inputs (pure), keep it pure and pass
the radar/matrix/visibility-filtered data in, so the contract stays unit-testable; do
the DB gathering in `fetchScorePayload`.

## Files touched (anticipated)

- `src/lib/api/score-payload.ts` — new fields, privacy filter, radar/matrix wiring.
- `src/lib/api/leaderboard-payload.ts` — new row fields.
- `src/lib/leaderboard.ts` — add `canonicalIndustries` (and status if needed) to row.
- `src/lib/developers/agent-guide.ts` — full rewrite.
- `src/app/(authed)/developers/page.tsx` — docs UI.
- Tests under `tests/` for the two payload builders.
- Reused (not modified unless needed): `src/lib/credibility.ts`,
  `src/lib/founder-matrix.ts`, `src/lib/credibility-vectors.ts`.

## Risks / watch-items

- **Cost/latency on `score`:** matrix population load — bounded by the 5-min cache;
  confirm the cache is process-shared and that the API route doesn't defeat it.
- **Summary privacy model:** must be verified against the profile page before shipping
  (see §2).
- **Radar/matrix gating:** dimensions must be null exactly when the profile page hides
  them, so the API never implies signal that isn't there.
- **Leaderboard `industry` filter:** confirm `parseLeaderboardFilter` already accepts it;
  if not, wiring it is a small addition (still in scope to document either way).
