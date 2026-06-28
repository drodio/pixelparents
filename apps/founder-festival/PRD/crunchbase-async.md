## Merge update — synced with main (audit batches)

Merged origin/main into the branch. Only conflict was EvalProgress.tsx — kept the async-enrichment info box AND main's improved gold "Scoring…" line gating (scoreComputing && finale.length>0). inTally still drives the scroll. tsc + tests green.

## Progress Update as of 2026-06-10 (Pacific) — generalized to the BrightData async suite
*(Most recent updates at top)*

### Summary
Generalized async BrightData enrichment into a DATASET REGISTRY (bd-datasets.ts) driven by bd-async.ts, and wired three exact/strong-identity datasets: Crunchbase Company, LinkedIn Company, Crunchbase Person. Plus linkedin_num_id dedup + the EvalProgress info box + 3 new waterfall steps. Migration 0049 adds `bd_async` jsonb + `linkedin_num_id`. Applied to DEV; prod GATED.

### Detail
- `src/lib/bd-datasets.ts` (NEW): BD_DATASETS registry. Each: {key, source, datasetId, resolveInput(ctx), corroborate(rec,ctx), facts(rec)}.
  - crunchbaseCompany (domain→slug; corroborate domain-or-founder; funding/exits/employees/Semrush/Apptopia/investors).
  - linkedinCompany (input EXACT from LinkedIn current_company.company_id; headcount/followers/funding → operator/distribution).
  - crunchbasePerson (input EXACT, chained off the company founders list name-matched; board/advisor roles + press → investor/operator).
- `src/lib/bd-async.ts` (NEW, replaces crunchbase-async.ts): maybeTriggerBdAsync (queue resolvable datasets; chained ones unlock as deps cache) + sweepBdAsync ({rescore callback, maxRescore cap}; poll→download→corroborate→cache→queue-chained→rescore-once; terminal-empty markers).
- `src/lib/brightdata.ts`: generic triggerBdSnapshot / downloadBdSnapshot primitives.
- enrichers: generic bdAsyncEnrich registered per BD_DATASETS entry (emits cached facts, no live fetch). `bdAsync` threaded through EnricherContext / RunEnrichmentsArgs / researchSubject / computeFreshScore; reEvaluate passes existing.bdAsync.
- eval-pipeline: post-scoring maybeTriggerBdAsync (runEval + reEvaluate); linkedin_num_id populate + dedup key + preserve-on-empty.
- cron: /api/cron/bd-async-sweep + vercel.json (*/3).
- rubric: LINKEDIN COMPANY DATA + CRUNCHBASE PERSON DATA sections (modest, no double-count, no point disclosure). eval-steps: 3 new white-checkmark steps; crunchbase.com → Crunchbase step.
- EvalProgress: async-enrichment info box below the gold line.
- Tests: bd-datasets (6) + crunchbase (12) + registry + dedup + scoring. 65 pass. Live-verified all dataset shapes.

### Loop safety
sweep rescore → enricher emits cached → post-scoring maybeTriggerBdAsync sees data set → skips → no new pending. Pending cleared per dataset on resolve; rescore capped (5/run); chained person resolves after company caches (≤2 rescores/founder).

### Concerns
- Prod migration 0049 REQUIRED before merge (code selects bd_async + linkedin_num_id).
- Cost: ~$0.0025/record + ~1–2 one-time rescores/founder (~$0.10–0.20), then free.
- Twitter/Glassdoor/G2/app-stores: framework-ready but input resolution (handle/URL) is unreliable → deferred (documented). Patents = USPTO API (separate; key provisioned).
