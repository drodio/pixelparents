# Branch: `nfx-signal-enricher` — progress log

Adds NFX Signal (signal.nfx.com) as a sixth Tier-1 enricher alongside
GitHub, Product Hunt, Wikipedia, YC, and exa-domain. NFX Signal is a
community-maintained VC + angel-investor directory; each profile carries
check size, stages, sectors, portfolio companies, and quality signals.

Branched from `main` after PR #19 merged.

## Progress Update as of 2026-05-23 6:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 1 ship (smallest verifiable slice per operator decision):
plumbing + smoke-test against 3 hardcoded investors. No rubric
integration yet — that's a follow-up after we eyeball whether the
data is consistently useful across more subjects.

Architecture: NFX has no public API, so we scrape via Apify's
`canadesk/nfx-mercury-vc` Actor ($1 / 1k results). Two steps per
investor: name-search returns slugs (capped at 8 hits), then a
profile-by-slug call returns the rich record. Both require an NFX
Bearer JWT copied from a logged-in Signal session.

Smoke test (3 investors): all returned good data on first try after
fixing the input schema bug. Sample output for a top-tier VC (Jordan Lee):

```
Listed on NFX Signal as Jordan Lee (Vertex Capital).
Headline: "Co-Founder & General Partner at Vertex Capital".
Check size: $500k–$40M (target $20M).
Invests at stages: Series B, Series A, Seed, Other Lists.
Sectors: AI, BioTech, Education, IoT, Consumer Internet, Enterprise,
  Health IT, Health & Hospital Services (+4 more).
Location: Mountain View, California.
NFX community vote count: 35.
Current fund size (per NFX): $2.2B.
Portfolio (per NFX, 77 total): Acme AI, Northwind, Contoso, Initech,
  Globex, Hooli, Umbra, Vantix (+69 more).
```

Spend on the smoke test: ~$0.04 (3 investors × 2 Apify calls each).
Apify free-tier budget is $5/mo so we have plenty of headroom.

### Detail of changes made:
- `src/lib/apify.ts` (new): thin wrapper around Apify's
  `run-sync-get-dataset-items` endpoint. Reads `APIFY_API_TOKEN`
  from env, posts the Actor input, returns the dataset items.
- `src/lib/enrichers/nfx.ts` (new): `enrichWithNfx(ctx)` follows the
  same `EnricherContext → EnrichmentResult` shape as the other Tier 1
  enrichers. Two-pass: name search → slug → profile fetch. Returns
  empty if either token is missing or the Actor errors (graceful
  degradation — rest of the pipeline still produces a score).
- `src/lib/enrichers/types.ts`: added `"nfx"` to the `source` union.
- `scripts/test-nfx.mjs` (new): one-off smoke-test driver hitting the
  enricher for 3 known investors. Run via `npx tsx --env-file=.env.local
  scripts/test-nfx.mjs`.
- `.env.example`: documented both `APIFY_API_TOKEN` and
  `NFX_SIGNAL_TOKEN` with retrieval instructions.

### Schema-debugging notes (preserved for future maintainers):
- The Apify Actor's published docs claim records carry a `_type`
  discriminator (`nfx_search_result`, `nfx_profile`). They don't —
  identify search hits by `person?.slug`, identify profiles by the
  richer field set (`investments_on_record`, `investor_lists`).
- Default `source` is `"mercury"` not `"nfx"`; you must spell it
  out. Same for `operation` (default `"categories"`).
- `maxResults` must be ≥ 8 even when you only want one record.
- `min_investment` / `max_investment` / `target_investment` come back
  as numeric **strings** ("500000") not numbers. Coerce on read.
- `areas_of_interest_freeform` is a string (often empty), not array.
- `stages` is NOT at the top level — derive it from the
  `stage_name` on each entry in `investor_lists[]`. Same for sectors
  via `vertical.display_name`.
- `investments_on_record` is a paginated wrapper:
  `{ record_count, edges: [{ node: { company_display_name, ...} }] }`.
- `location` is an object: `{ id, display_name }`. Use `display_name`.

### Next steps (Phase 2, deferred):
- Wire `enrichWithNfx` into `runEnrichments()` so it runs on every
  fresh eval alongside github/producthunt/wikipedia/yc/exa-domain.
- Add NFX-specific facts to the `TIER 1 ENRICHMENT SOURCES` block of
  the Claude scoring prompt.
- Update `SCORING_RUBRIC` so Claude rewards NFX-derived signals:
  - "Claimed" profile → +5 (the investor cared enough to verify)
  - "Leads rounds" → +10
  - High NFX vote count (≥50) → +15
  - Active investor with ≥10 portfolio cos on record → +20
- New `extractedMetrics` fields populated from the NFX response:
  `nfxClaimedProfile`, `nfxLeadsRounds`, `nfxPortfolioCount`,
  `nfxVoteCount`. Surface as badges later.

### Phase 3 (founder-side cross-reference, also deferred):
- For each founder eval, check whether their company appears in any
  NFX investor's `investments_on_record.edges[].node.company_display_name`.
  If yes, emit a founder-rubric rule: "+5 per NFX-tracked investor
  who backed them, capped +25." Stronger signal than self-reported
  founder claims because the NFX side is third-party-attested.

### Potential concerns to address:
- **Gray-area scrape.** NFX's ToS likely prohibits this. We're using
  a real user's auth token (`drodio@storytell.ai`'s NFX session).
  Risks: token invalidation, ToS-driven blocks, low-cadence safety
  (we should cache aggressively — 24h-7d per investor — and never
  bulk-page the entire Signal directory).
- **Smoke-test investors don't have `claimed` / `leads_rounds` set.**
  All three returned `null` for those fields. Either NFX exposes them
  only for explicitly-claimed profiles (so the population is small),
  or they require a different API call. Worth retesting against
  someone who's clearly claimed their profile (drodio could claim
  his own if he has one, or pick a less-famous active angel).
- **A prominent angel investor's firm shows as a lesser-known
  affiliated entity** —
  technically correct (one of their many affiliations) but unintuitive.
  NFX appears to pick whichever firm record the slug primarily ties
  to. Acceptable, but flagging in case it confuses users.
- **No per-investor rate-limit handling yet.** Phase 2 should add a
  Postgres-cached lookup so we never re-query the same investor twice
  in 24h, regardless of how many evals reference them.
