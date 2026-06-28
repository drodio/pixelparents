# PRD — events-as-recommendations

## Progress Update as of 2026-06-05 10:26 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Reframed the profile "Are these your current priorities?" section into "Would you attend these IRL Festival events?" — each item is now a proposed IRL Festival event instead of an advice/priority. Mechanism: a cheap Sonnet "recommendations-only" pass that reads a profile's already-stored priorities + summary and converts each into a concrete event (no Exa, no full re-score), writing back to the SAME `evaluations.recommendations` shape so ratings/visibility/categories keep working. Validated on dev (~$0.012/profile, 7-8 events each, high quality). Pilot target: top 100 prod profiles by combined score.

### Detail of changes made:
- **`src/lib/event-recommendations.ts`** (new): `generateEventRecommendations(input, model)` builds a prompt from `{fullName, summary, priorities[]}` and calls the AI gateway (`generateText`, default `anthropic/claude-sonnet-4-6`), parsing/validating to `{summary, items:[{id,text,category}]}` (same 6 categories). `regenerateEventRecsForEval(evalId, model)` reads the stored recs, reframes them, and writes back `evaluations.recommendations`. Skips rows with no existing recs. NOTE: regenerated items get fresh slug ids, so any old `recommendationResponses` ratings keyed on old ids orphan (fine for the unclaimed top-100 pilot).
- **`src/components/Recommendations.tsx`**: heading "Are these your current priorities?" → "Would you attend these IRL Festival events?"; custom-row placeholder "What else do you need?" → "What other events would you like to participate in?". Kept the "What you likely need" summary + intro blurb (already event-framed), the 1-4 rating ("Hell No → Hell Yes" works for "would you attend?"), Public/Private, and the category taxonomy.
- **`scripts/backfill-event-recs.ts`** (new): modeled on `backfill-founder-status.ts`. Selects top-N evals by combined `score` (excluding low-signal/code/hidden) with existing recommendations and regenerates via Sonnet. Flags: `--target=dev|prod`, `--limit=N` (default 100), `--model=`, `--dry` (list only, no LLM/writes), `--concurrency=N` (default 4). Self-loads env from `.env.local`/`.env.prod.local`.

### Verification done:
- `next build` compiles + typechecks.
- Dev real run (`--limit=2`): Jordan Lee (7 events, $0.0119) + Alex Kim (8 events, $0.0136). Output reviewed — concrete, specific, well-categorized events; DROdio approved the format.

### Potential concerns to address:
- **Deploy ordering:** the new heading is a CODE change that must reach prod BEFORE (or close to) running the backfill, else refreshed profiles briefly show event text under the old "priorities" heading. Plan: merge code → run top-100 prod backfill.
- **Existing profiles outside the top 100** keep their old priority text under the new heading until re-scored or backfilled (forward-only for the long tail — this is the agreed Option A behavior beyond the pilot).
- **Orphaned ratings:** see note above — new item ids orphan old ratings. Only matters for claimed/rated profiles; top-100 pilot profiles are unclaimed.
- **Prod backfill is a prod data write** (overwrites 100 rows' `recommendations`, reversible only via re-score) and is gated by the harness — run explicitly with DROdio's go-ahead.
