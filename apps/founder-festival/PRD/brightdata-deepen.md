## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Deep BrightData pass. Shipped the fast/safe wins (LinkedIn recommendations fact + linkedin_num_id capture) and built — but intentionally did NOT wire — the Crunchbase company enricher, because Crunchbase collection (~19–32s, variable) is too slow for a synchronous eval-blocking enricher. The Crunchbase client, corroboration, and fact-rendering are unit-tested and ready for an async wiring.

### Detail of changes made:
- `src/lib/brightdata.ts`: Crunchbase client `fetchBrightDataCrunchbase(slugs)` + `BrightDataCrunchbaseCompany` type; LinkedIn type gains `recommendations_count` + `linkedin_num_id`.
- `src/lib/enrichers/brightdata.ts`: surfaces a LinkedIn recommendations fact.
- `src/lib/enrichers/brightdata-crunchbase.ts` (NEW, unwired): `enrichWithCrunchbase` + `crunchbaseSlug` + `corroborateCompany` (founders-include-subject OR website-domain-in-footprint) + `crunchbaseFacts` (funding/acquisition/employees/traffic/downloads/investors/IPO). Header explains the async-pending status.
- `src/lib/enrichers/index.ts`: documents why crunchbase is NOT registered.
- `src/lib/scoring-rubric.ts`: CRUNCHBASE COMPANY DATA section (authoritative; fold into existing rows; modest traction on 100k+ visits/downloads; no point disclosure).
- `src/lib/credibility-vectors.ts`: web-visits/app-downloads/headcount → traction axis (after operator-scaling).
- Tests: `tests/lib/brightdata-crunchbase.test.ts` (slug/corroboration/facts), registry test note. All green.

### The async Crunchbase wiring (the next step — needs a migration + a decision):
1. Add `crunchbase jsonb` (cached data) + `crunchbase_pending jsonb` ({snapshotId, slug, at}) to evaluations.
2. Thread the eval's cached crunchbase into the enricher context (RunEnrichmentsArgs).
3. Crunchbase enricher: emit from cache if present; else empty.
4. Post-scoring state machine (in scoreInputs/reEvaluate, NEVER blocking >~2s): if cache present skip; else if a pending snapshot is ready → download + cache; else trigger one + store pending. Natural re-scores advance the state; no cron required. Result: no eval slowed >~2s, re-scores instant + free once cached.

### Potential concerns to address:
- Crunchbase value is HIGH (funding/exits/traffic/downloads across traction/operator/fundraising vectors) but gated on the async build + a prod migration. Needs DROdio's nod on the migration + the (small) per-eval trigger cost.
- linkedin_num_id is captured in the BrightData raw but not yet used for dedup; wiring it as the strongest dedup key (a dedicated column) is a clean follow-up that would have caught the Joshua case even without a shared website.
