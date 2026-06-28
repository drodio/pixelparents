# Branch: `neo-investor-enricher` — Neo (neo.com) as a structured investor enricher

Phase 1 of a two-phase plan: feed Neo's structured investor facts into the
existing scoring rubric + drive new investor badges (stage focus, industry
focus, leads-rounds). Phase 2 (a future spec) adds the Endorsements section
with deep-linked endorser names; that needs a headless-browser render and is
explicitly out of scope here.

Brainstorm spec lives in the `.superpowers/brainstorm/` directory (artifact
output of the visual companion session); the relevant decisions are folded
into the design below.

---

## Why now

Neo runs on Bubble.io and exposes its public Data API without auth. That
makes Neo investors a high-quality, free, structured data source for the
exact facts our investor rubric tries to extract from text today:

- Firm role (`Profile Org` + `Profile Title` — e.g. "Partner at Neo")
- Investment stages (`ApplyStages` array, e.g. `["Pre-seed (1-10 ppl)", "Seed (10-20 ppl)", "Series B (50-100 ppl)"]`)
- Industry/sector focus (`ApplyIndustries` array)
- Leads-vs-follows (`invLeadsDeals` boolean)
- Check size (text range, e.g. `"$500K - $2M"`)
- Portfolio sketch (`invStartups` free-text list)
- Accredited status (`isAccredited`)
- Endorsement count (`numEndorsements` — display only in Phase 1)

Verified from the live API against Suzanne Xie's record at
`/api/1.1/obj/user?constraints=[{"key":"Slug","constraint_type":"equals","value":"02-suzanne-xie"}]`
plus the joined `/api/1.1/obj/person` lookup. Total visible Neo VCs ≈ 215
(`isVC=true AND isVisible=true`), so this is a small high-quality set.

---

## Decisions locked during brainstorming

1. **Sequencing:** Phase 1 only. Endorsements section is Phase 2.
2. **Matching strategy:** LinkedIn URL only (strict). Bubble's
   `text contains "/in/<handle>"` constraint over the `Social LinkedIn`
   field on `person`. Post-filter on the response to confirm exact handle
   match (no `/in/handlelong` false positives). Name+firm fuzzy fallback
   intentionally deferred — easy to add later if recall is a problem.
3. **Fetch strategy:** Lazy on-demand, cached on the eval. The Neo
   enricher runs as part of `runEnrichments()` alongside NFX, Exa, etc.
   Result lands in `evaluations.profile.enrichments[]` so rescore is
   free. No new tables, no backfill job.
4. **Integration shape:** Approach A — Neo as an *additive evidence
   source*. Neo's facts feed the existing investor rubric (firm/capital/
   portfolio vectors) via the standard enricher→Claude→breakdown path,
   and a small set of normalized top-level columns lets badges read
   them without JSON parsing. No new "is on Neo" scoring axis.

---

## Architecture

```
runEnrichments()
  ├── enrichWithNfx(ctx)         ← already exists
  ├── enrichWithExaDomain(ctx)   ← already exists
  ├── …
  └── enrichWithNeo(ctx)         ← NEW
        ├── 1. GET /api/1.1/obj/person?
        │       constraints=[Social LinkedIn text contains "/in/<handle>"]
        │       limit=1
        │       → matched person record OR empty
        ├── 2. GET /api/1.1/obj/user?
        │       constraints=[_id equals person.User]
        │       limit=1
        │       → user record (stages, industries, leads-deals, slug, …)
        └── 3. Confirm linkedinHandle(subject) === linkedinHandle(person.Social LinkedIn)
              → emit { source: "neo", facts: [...], citations, raw }
```

All network errors / non-2xx / schema-drift cases swallow silently and
return `{ source: "neo", facts: [], citations: [], raw: null }` — same
posture as every other enricher. Logged via PostHog `$exception` for
visibility.

Cost: zero (Bubble Data API is free + unauthenticated). Latency: ~200–
400ms parallel with the existing enricher mesh, doesn't extend total
eval time.

---

## Data model — new columns on `evaluations`

| column | type | meaning |
|---|---|---|
| `investor_industry_focus` | `jsonb` `string[]` default `'[]'::jsonb` | union of industries from Neo + NFX |
| `investor_leads_rounds` | `boolean` nullable | OR-truth across Neo + NFX (null = unknown) |
| `investor_check_size` | `jsonb` `{ minUsd?, maxUsd?, rawText }` nullable | Neo's text range parsed when possible |
| `on_neo` | `boolean` nullable | tri-state: null = never checked / false = checked, no match / true = matched |
| `neo_slug` | `text` nullable | e.g. `"02-suzanne-xie"`. Enables backlink + Phase 2 endorsement fetcher. |

Drizzle migration: `0032_neo_investor_facts.sql` (generated via
`pnpm db:generate`). All new columns are nullable / defaulted — backwards
compatible, no backfill required. Applied to prod manually via the proven
path ([[prod-database-identity]] memory) in the same PR.

The existing `investor_stage_focus` (already `jsonb string[]`) is now also
fed by Neo. Conflict resolution: union of Neo stages + NFX stages,
deduped. Same for industries.

`evaluations.profile.enrichments[]` continues to hold the raw Neo payload
for audit / provenance / future re-derivation.

---

## Pipeline integration

`payloadToWriteFields` in `src/lib/eval-pipeline.ts` projects the new
fields out of the Neo + NFX raw blobs:

```ts
const neoRaw = enrichments.find(e => e.source === "neo")?.raw as NeoRaw | undefined;
const nfxRaw = enrichments.find(e => e.source === "nfx")?.raw as NfxRaw | undefined;

const stages    = uniqueStrings([...(neoRaw?.stages ?? []),    ...(nfxRaw?.stages ?? [])]);
const industries = uniqueStrings([...(neoRaw?.industries ?? []), ...(nfxRaw?.verticals ?? [])]);
const leadsRounds = neoRaw?.leadsRounds ?? nfxRaw?.leads_rounds ?? null;
```

`investorStageFocus` continues to fall back to Claude's `scoring.investorStageFocus`
when neither enricher produced anything (legacy / non-Neo / non-NFX).

---

## Scoring rubric

Approach A is *additive*. Neo's natural-language facts (`"Partner at Neo."`,
`"Leads rounds."`, `"Check size: $500K–$2M."`) flow into the existing
Claude prompt via `renderEnrichmentsForPrompt`, and Claude's resulting
breakdown rows get attributed to existing investor vectors
(`firm`, `capital`, `portfolio`) by the existing regex in
`credibility-vectors.ts:INVESTOR_REASON_RULES`.

One small refinement: extend the `firm` rule to explicitly catch
"lead investor" / "leads rounds" phrasings, so those lines reliably land
in `firm` rather than fall through to `null`.

No new investor vector. No "is on Neo" bonus. Neo is just a higher-
confidence evidence source.

---

## Badge derivation

`BadgeInputs` in `src/lib/badges.ts` gets four new optional fields:

```ts
type BadgeInputs = {
  // … existing …
  investorStageFocus?: string[] | null;
  investorIndustryFocus?: string[] | null;
  investorLeadsRounds?: boolean | null;
  onNeo?: boolean | null;
};
```

`computeBadges` emits:

| input | badge | category |
|---|---|---|
| `investorStageFocus` contains "Seed" | `Seed-Stage Focus` | investor |
| `investorStageFocus` contains "Pre-seed" | `Pre-Seed Focus` | investor |
| `investorStageFocus` contains "Series A" | `Series A Focus` | investor |
| (etc. for Series B / C / Growth) | … | investor |
| `investorIndustryFocus[i]` (cap 4) | `<industry> Focus` | investor |
| `investorLeadsRounds === true` | `Leads Rounds` | investor |
| `onNeo === true` | `Featured on Neo` | investor |

All editable + dismissable via the existing badge override system.
`BADGE_CATALOG` gets matching entries so they appear in the "+ add" picker.

---

## Failure modes

- **Neo API down / 5xx / timeout (3s budget):** enricher returns empty,
  `onNeo` stays null on the eval, no badges added, eval otherwise normal.
  Logged to PostHog.
- **Person record exists but `Social LinkedIn` is empty:** can't match by
  LinkedIn. Treated as "not on Neo" for this eval. We're explicitly
  trading off recall for precision (locked in during brainstorming).
- **Bubble schema drift (field rename, type change):** enricher's
  optional-chain reads return undefined → fewer facts emitted, no crash.
  PostHog captures any thrown error.

---

## Out of scope (Phase 2)

- **Endorsements section** with truncated quotes + deep-linked endorser
  names. Requires headless Chrome (Playwright) to render the JS-loaded
  page and pull `text_text` + `endorser_user` FK. Separate refresh
  cadence, separate UI work, separate PR.
- **Home-page name+company fallback search** for endorsers without a
  Festival profile (`/?q=<name>&company=<co>` deep-link). Phase 2.
- **Bulk pre-seed of all Neo investors** into a `neo_investors` table.
  Lazy-fetch is sufficient for V1; revisit if leaderboard discovery wants
  it.
- **NFX `verticals` are sourced from `investor_lists.vertical.display_name`** —
  may not be 1:1 with Neo's `ApplyIndustries` text. Conflict resolution
  is union-and-dedupe; cosmetic normalization (e.g., "B2B SaaS" vs
  "B2B/SaaS") deferred.

---

## Progress Update as of 2026-06-03 03:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Initial spec landing. Brainstorming locked in: Phase 1 (Neo enricher +
scoring + badges), strict LinkedIn URL match, lazy on-demand fetch,
Approach A (Neo as additive evidence source). About to scaffold the
schema migration, enricher, pipeline wiring, badges, and tests.

### Detail of changes made:
- Verified Neo's Bubble Data API responds without auth and that
  `Slug equals` + `Social LinkedIn text contains` constraint forms both
  return clean structured JSON.
- Captured the endorsement schema from the JS bundle (Phase 2 input):
  `{ text_text, endorser_user, endorsee_user, backed_boolean, tags_list_text, timestamp_date, likecount_number }`.
- Mapped the existing investor-facing surface: `INVESTOR_REASON_RULES`
  in `credibility-vectors.ts`, `computeBadges` in `badges.ts`,
  `payloadToWriteFields` in `eval-pipeline.ts`, `BadgeInputs` shape.
- Total Neo VCs (`isVC=true && isVisible=true`): 215. Cheap to enumerate
  if Phase 1.5 ever wants a bulk index.

### Potential concerns to address:
- Bubble Data API has no published SLA. Treat as best-effort. If they
  start rate-limiting we add a 1-rps token bucket + back off.
- The `ApplyStages` strings (`"Pre-seed (1-10 ppl)"`) include team-size
  in parens — we strip that for badge labels. NFX uses different stage
  names; the dedupe key is normalized lowercase + leading word.
