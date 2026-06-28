# Founder Signal Sources — Data-Acquisition Layer

**Date:** 2026-05-25
**Branch:** `founder-signals` (renamed from `nfx-direct-scraper`)
**Author:** Claude (autonomous build, authorized by DROdio)
**Source PRD:** Festival.so Founder Profile & Scoring Platform Improvements v0.2 (post-stakeholder feedback)

## Goal

Broaden the enrichment layer from "one LLM reading web snippets" to a portfolio of
clean, free (or almost-free) data sources that feed trustworthy signal into founder
credibility scoring. NFX (in progress on the prior branch scope) becomes one source
among many.

This work is the **data-acquisition layer** for the PRD's depth features
(FEAT-01 capital raised, FEAT-02 technical-depth vectors, FEAT-03 unfair advantage,
FEAT-04 fit score). We are NOT building the spider-graph UI or the unfair-advantage
copy yet — we are making sure the *data* exists and flows.

## Decisions (locked with DROdio before the run)

1. **Scope:** Depth over breadth. Ship the highest-value keyless sources end-to-end,
   each wired in and smoke-tested, rather than stubbing all 12+.
2. **Scoring:** Add explicit `SCORING_RUBRIC` rules for each new source (not just
   acquire). New rules mirror the existing GitHub / Product Hunt sub-rule style.
3. **Delivery:** Incremental commits on `founder-signals`, push, open a PR.
4. **Keys:** Keyless sources only this run. Optional keys (Stack Exchange,
   Semantic Scholar, Hugging Face) degrade gracefully. Hard-key sources
   (YouTube, Companies House UK) deferred.

## Architecture (reuses the existing enricher pattern)

Every source is an enricher: `(ctx: EnricherContext, knownUrls?) => Promise<EnrichmentResult>`,
returning `{ source, facts[], citations[], raw? }`, wrapped in `Promise.allSettled`
inside `runEnrichments()`. Failures return an empty result so the pipeline never
breaks. No DB migration — raw data rides in the existing `evaluations.profile`
jsonb; caching is in-memory per runtime instance (à la `yc.ts`).

### New shared module: `src/lib/enrichers/identity.ts`

Half the new sources (HN, Stack Overflow, npm, Hugging Face) have **no name→account
lookup**, so naive name-guessing would attribute a stranger's reputation to a founder
(verified: HN handle `jordan` ≠ a well-known investor of the same name, 113 karma). This module generalizes
the confirmation logic already inline in `github.ts`:

- `deriveHandleCandidates(ctx)` — generate plausible handles from fullName
  (`jane-doe`, `janedoe`, `jdoe`, …) + the LinkedIn handle, capped.
- `confirmIdentity({ ctx, candidateName?, bio?, knownUrlHit })` — accept a candidate
  only when corroborated: an exact known-URL hit, OR name overlap, OR the bio
  references a name/company/social URL we already know. **Precision over recall** —
  a credibility product must not show false attributions.

### Sources built this run (priority order)

| Source | File | Vector(s) | Auth | Identity match |
|---|---|---|---|---|
| Hacker News | `hackernews.ts` | ENG, GTM, PROX | none | derive + confirm via `about` |
| SEC EDGAR | `sec-edgar.ts` | FUND, OPS | UA only | company/person name → CIK |
| Stack Overflow | `stackoverflow.ts` | ENG | none (key optional) | derive + confirm |
| npm | `npm.ts` | ENG | none | derive + confirm via maintainer |
| Hugging Face | `huggingface.ts` | ENG (AI founders) | none (token optional) | derive + confirm |
| Wikidata | `wikidata.ts` | OPS, DOM, notability | none | name → entity, "founder of" |
| OpenAlex | `openalex.ts` | DOM (academic) | none (mailto polite) | name → author, affiliation |

### Scoring rules (added to `SCORING_RUBRIC`)

Each source gets a small sub-rule block in the FOUNDER (or INVESTOR) rubric, styled
like the existing GitHub/PH blocks: tiered points for the strongest signal, reason
text that cites the specific fact. SEC EDGAR Form D additionally improves the
`extractedMetrics.totalRaisedUsd` accuracy by giving Claude an authoritative figure
to prefer over press-snippet guesses (the FEAT-01 fix).

## Verification

- Per-enricher smoke script (`scripts/test-<source>.mjs`) run against real people via
  `npx tsx --env-file=.env.local`, mirroring `scripts/test-nfx.mjs`.
- Unit tests (vitest) for pure logic: handle derivation, identity confirmation,
  number/funding parsing.
- `npx tsc --noEmit` + `npm run lint` before each commit.

## Out of scope (this run)

Spider-graph UI, unfair-advantage copy generation, fit-score computation, deck
gallery, privacy controls, paid vendors (Crunchbase/PDL/Coresignal), and hard-key
sources (YouTube, Companies House). All noted in the inventory for later waves.
