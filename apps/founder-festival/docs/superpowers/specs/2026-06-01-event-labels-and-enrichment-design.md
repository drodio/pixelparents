# Event Badge Labels + Pipeline Enrichment — Design

**Date:** 2026-06-01
**Branch:** `worktree-event-labels`
**Author:** DROdio (with Claude)

## Background

DROdio bought a Brother QL-800 label printer (with BETCKEY DK-2251-compatible
continuous labels: 62mm-wide, two-color **black + red** on white). He wants to
print **name badges for event attendees**, pulling content from our database.

While scoping the badge content (name, company, QR code, **spider chart**), we
discovered the DB has no clean company *name* — it's guessed at read-time from a
domain. Tracing the pipeline showed we already *fetch* rich identity data
(company name, job title, headline, location, school, investor firm/check-size,
GitHub follower counts, …) but discard it into a debug-only `raw` blob. DROdio
asked to fix this and make the DB "very rich."

This is **two projects**, sequenced. Project 1 (enrichment) is the foundation;
Project 2 (labels) consumes `companyName` from it.

---

## Project 1 — Pipeline Enrichment

### Goal

Promote the reliable, dense identity data we already fetch into a clean,
structured `profile.identity` block on each evaluation. Stop guessing company
name from a domain.

### Storage

A single structured object on the existing `profile` JSONB column — **no DB
migration**. Documented by an `Identity` TypeScript type in `src/lib/identity.ts`.

Rationale: all enrichment data already lives in JSONB; a sub-object is flexible
and avoids schema churn (and the `db:push`-from-checkout hazard). Individual
fields can be promoted to real columns later *only if* we need to filter/sort on
them.

### `Identity` shape (IN — reliable + dense)

| Field | Type | Source (priority order) |
|---|---|---|
| `companyName` | `string \| null` | LLM `identity` → NFX `firm` → domain capitalization |
| `jobTitle` | `string \| null` | LLM |
| `headline` | `string \| null` | LLM (LinkedIn headline verbatim) |
| `location` | `{ city, region, country } \| null` | NFX `location` → LLM |
| `websiteUrl` | `string \| null` | LLM → derived from `primaryCompanyDomain` |
| `github` | `{ username, followers, topRepo, topRepoStars, activeLast90d } \| null` | GitHub enricher `raw` |
| `education` | `Array<{ institution, degree? }>` | Wikidata `raw` / LLM |
| `ycBatch` | `string \| null` | existing `extractedMetrics.ycBatch` |
| `wikipedia` | `{ title, url } \| null` | Wikipedia enricher |
| `investor` | `{ firmName, leadsRounds, checkSize:{min,max,target}, stages[], verticals[], fundSize, portfolioCount } \| null` | NFX `raw` (only when matched) |
| `secFilingsCount` | `number \| null` | SEC-Edgar `raw` (count only) |

### OUT (deliberately excluded — too sparse / unreliable)

- Years of experience (derived/fuzzy; inconsistent across sources)
- Company revenue / employee counts parsed from free-text mentions (unreliable)
- Full SEC issuer/filing lists (niche; keep only `secFilingsCount`)
- Raw API dumps beyond what `enrichments[].raw` already retains (the long tail
  stays in the existing debug blob — we lose nothing)

### Extraction architecture

1. **LLM schema** — add an `identity` object to `SCORING_SCHEMA` (Zod, in
   `scoring.ts`) and mirror it in `SCHEMA_HINT` (in `eval-pipeline.ts`). Claude
   already reads the full LinkedIn page + enrichment facts during scoring, so
   it's the highest-quality, zero-extra-cost extraction point. All fields
   nullable with `.catch()` defaults so a garbled value never fails the whole
   eval (same defensive pattern as the existing breakdown schema).
2. **`buildIdentity(inputs)`** in `src/lib/identity.ts` — a pure priority-merge:
   takes the LLM `identity` output + enrichment results + `extractedMetrics` +
   `primaryCompanyDomain`, returns a normalized `Identity`. No I/O → unit-testable.
3. **Wire-in** — call `buildIdentity()` in `payloadToWriteFields()`
   (`eval-pipeline.ts`) and write the result to `profile.identity`.
4. **Read-time** — `companyNameFromDomain` callers (`profiles-scored.ts:314`,
   `leaderboard.ts`) prefer `profile.identity.companyName`, keeping the old
   domain guess only as a fallback.

### Backfill

- Read-time fallback stays → existing rows never break.
- One-time script `scripts/backfill-identity.ts` reconstructs `identity` from
  data **already stored** on each row (NFX `raw`, domain, `extractedMetrics`,
  GitHub `raw`) — **no LLM cost**. LLM-only fields (`jobTitle`, `headline`) stay
  null on old rows until they're naturally re-scored. The script is **not run
  against prod automatically** (per repo deploy rules — separate dev/prod DBs);
  DROdio/ops runs it.

### Testing

Unit tests (`tests/lib/identity.test.ts`) for `buildIdentity()`'s priority merge
across fixtures: LLM-present vs absent, NFX-present vs absent, domain-only, empty.
Plus a test that read-time `companyName` prefers `identity.companyName`.

---

## Project 2 — Event Badge Labels

### Goal

A **"Print badges"** button on the admin event page that renders print-ready
name badges for attendees, sized for the QL-800's 62mm continuous label.

### Approach: HTML print route + browser print

Chosen over a server-generated PDF because it reuses our existing radar SVG
math, makes the two-color (red) label work for free via CSS color, and is the
least code with the easiest visual iteration. The QL-800 prints fine from the
browser print dialog; "Save as PDF" also works.

### Components

1. **Dependency:** add `qrcode` (+ `@types/qrcode`) — generates QR as an inline
   SVG string, server-side.
2. **`src/lib/qr.ts`** — `qrSvg(text)` async helper → SVG markup string.
3. **`src/components/BadgeRadar.tsx`** — a *static* mini spider chart (no
   interactivity, no legend). Reuses the polygon math from `CredibilityRadar`:
   faint grid + dashed median ring (black) + **this-person polygon in red**
   (`#e23b2e`-ish, which the QL-800/DK-2251 prints as the red channel). Tiny
   or no axis labels (illegible at badge scale). Takes `RadarVector[]`.
4. **Print route** `src/app/(authed)/admin/events/[id]/badges/page.tsx`:
   - `adminGate` + `canAccessEvent` (same guards as the event detail page).
   - Reads `?status=` (default `approved`); lists applicants at that status,
     joins `evaluations` for `fullName` / `profile` / `breakdown` / `slug` /
     `slugKind`.
   - Per attendee: `identity.companyName` (with fallback), radar vectors via
     `getCredibilityRadars(breakdown)` for the canonical dimension (`slugKind`),
     and a QR to the absolute profile URL (`NEXT_PUBLIC_SITE_URL` + `profileUrlFor`).
   - Renders **one badge per page** with CSS `@page { size: 90mm 62mm; margin: 0 }`
     (landscape on the 62mm tape). Layout: small "FOUNDER FESTIVAL" wordmark
     header; name large + company beneath on the left; mini spider chart top-right;
     QR bottom-right. A tiny client component calls `window.print()` on load.
5. **Trigger:** a "Print badges" link/button on
   `admin/events/[id]/page.tsx` that opens the badges route in a new tab,
   carrying the **currently-selected status filter** (default approved).

### Data assembly is a pure helper

`buildBadgeData(applicant, evaluation, radars, siteUrl)` → `{ name, company,
profileUrl, vectors }` is pure and unit-tested; the route does the I/O and
rendering around it.

### Testing

Unit tests for `buildBadgeData` (canonical-dimension pick, company fallback,
profile URL) and the `BadgeRadar` polygon point math. The print route /
`window.print` is verified by `next build` compiling and rendering without error
(physical print verified by DROdio).

---

## Out of scope / notes

- No DB schema migration in either project (JSONB only).
- The pre-existing failing test baseline (`column "find_email_queued_at" does
  not exist` — a pending migration on the shared dev DB) is **unrelated** to this
  work and is left for DROdio/ops to resolve before merge.
- Backfill against prod is a manual op, not run by this branch.
