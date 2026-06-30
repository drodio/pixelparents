## Progress Update as of [June 30, 2026 — 6:38 AM Pacific]

### Summary of changes since last update
First entry. Upgraded the Community "people who can help" matcher from pure
deterministic tag-overlap to AI-assisted semantic re-ranking, with a strict
graceful fallback to the existing deterministic matcher. The deterministic
`rankCandidates` is now the candidate PRE-FILTER + the fallback; a new
`lib/match-ai.ts` re-ranks the pre-filtered top candidates via the existing
Vercel AI Gateway and attaches a one-line rationale per suggested-helper card.

### Detail of changes made:
- **`lib/ask-matching.ts`** — unchanged logic; added an OPTIONAL `rationale?:
  string` field to `AskMatch`. The deterministic `rankCandidates` never sets it
  (absent on the keyless fallback), so the UI treats it as optional. This file
  remains the pure, DB-free, keyless pre-filter + fallback.
- **`lib/match-ai.ts`** (NEW) — `aiRankMatches(ask, deterministic, candidates,
  model?)`:
  - ONE cheap model call over the whole candidate set (not per-candidate).
  - Talks to the Vercel AI Gateway via plain `fetch` (OpenAI-compatible chat
    completions), mirroring `lib/enrichment/info-extract.ts` exactly — env
    `VERCEL_AI_GATEWAY` (or `AI_GATEWAY_API_KEY`), model `MATCH_AI_MODEL` default
    `anthropic/claude-haiku-4-5`. Falls back to a direct Anthropic call when only
    `ANTHROPIC_API_KEY` is set. Env read lazily inside fns (cold-start safe).
  - Zod-validates the model output (`{ranked: [{signupId, rationale}]}`).
  - Re-ranks by the model's order, attaches the per-match rationale, ignores
    invented/duplicate ids, and APPENDS any candidate the model dropped in
    deterministic order so a privacy-allowed suggestion is never silently lost.
  - Graceful fallback: no key / call throws / invalid JSON / schema fail / zero
    usable matches → returns the deterministic list UNCHANGED (rationale-less).
    NEVER throws to the caller.
  - Per-ask cache keyed by ask id + tag list + sorted candidate signupId
    fingerprint (FIFO-evicted, bounded at 200) so re-renders of the
    force-dynamic detail page don't re-pay; a changed candidate roster re-runs.
    `_clearMatchCache()` exported for tests.
  - PRIVACY: sends ONLY non-PII matching data — the matcher's expertise signals
    + the curated, shareable enrichment slice (bio / expertise / canHelpWith)
    via `curatedEnrichmentOf`. No emails/phones, no raw fact dumps, no new
    contact data. The candidate set itself is exactly what `getSuggestedHelpers`
    (which already applies `isDirectoryVisible` + verification gating) allowed.
- **`app/(authed)/community/[id]/page.tsx`** — after `getSuggestedHelpers`
  returns the deterministic pre-filtered list, the page fetches the suggested
  members' rows, builds `AiCandidate[]` (signals + curated enrichment), and
  calls `aiRankMatches`. Renders the rationale subtly (small italic muted line)
  on each suggested-helper card; the subheading flips to "Ranked by fit." when
  any rationale is present, else stays "By expertise overlap." Only runs when
  there are >1 suggestions.
- **Tests** — `lib/match-ai.test.ts` (NEW, 11 cases) covers the re-rank happy
  path, invented/duplicate id rejection, all fallback paths (invalid JSON,
  schema fail, throw, zero usable, no key), the single/empty short-circuit,
  per-ask caching, and cache-miss on roster change. The model is mocked
  throughout (no network). The candidate pre-filter is already covered by the
  existing `lib/ask-matching.test.ts` (13 cases).

### Validation run:
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm test` — 39 files, 434 tests pass.
- `npm run build` — verified by copying the 3 files into the main checkout
  (`/Users/main/stanfordohs/pixelparents`, real node_modules), building
  successfully, then restoring the main checkout to pristine (the worktree
  symlinked node_modules break a direct `npm run build` here).

### Potential concerns to address:
- The cache is per-process in-memory; on a serverless platform each cold lambda
  has its own cache, so the "don't re-pay on re-render" guarantee holds within a
  warm instance but not across instances. Acceptable for a cheap Haiku call;
  revisit only if cost shows up.
- The model is asked to drop weak candidates, so the AI list can be SHORTER than
  the deterministic one before we append the dropped ones back — currently we
  always append them (no silent loss). If product later wants the AI to actually
  prune the list, change the append behavior deliberately.
- No new env var is required to run — without `VERCEL_AI_GATEWAY`/
  `ANTHROPIC_API_KEY` the page renders exactly as before (deterministic order),
  so this ships dark-safe. To turn it on in prod, set `VERCEL_AI_GATEWAY` (and
  optionally `MATCH_AI_MODEL`).
