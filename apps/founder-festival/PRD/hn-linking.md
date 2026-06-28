## Progress Update as of 2026-06-05 07:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Increment "B" of the HN deep-enrichment feature: HN score rows now deep-link to
their source. (Increment "C" — expandable sub-bullet rows — is owned by another
agent and dropped from my scope. "A" — HN content analysis into the right
vectors + industries — is next.)

### Detail of changes made:
- `src/lib/enrichers/hackernews.ts`: raw now carries `profile_url`,
  `submitted_url`, and each top post's `item_url` (built from the Algolia
  objectID).
- `src/lib/eval-pipeline.ts`: `applyHnCitations(scoring, enrichments)` (called in
  `scoreInputs` after the company bonuses) — a deterministic post-score step that
  injects per-phrase citations: a karma figure / `@handle` → HN profile, a
  story-post count → submissions feed, a top-post title → that post on HN. Only
  lands when the exact phrase is present in the model-written reason (no model
  dependence for the link itself). Exported `hnCitationsForReason` for tests.
- `tests/lib/hn-citations.test.ts`: 5 tests. tsc clean.
- Doc → v0.0.8c (UX, no point change).

### Next (increment A):
- HN content analysis: pull comment/post TEXT via Algolia, have the model judge
  the content and route signals to the right vector (technical/traction/domain/
  gtm) + canonical industries (the `src/lib/industries.ts` taxonomy). This also
  reworks the credibility-vectors attribution so HN content isn't blanket-routed
  to GTM.

### Potential concerns to address:
- Linking only takes effect on RESCORE (citations are written at score time).
- The top-post-title match is substring-based; if the model paraphrases a title
  heavily the link won't land (acceptable — degrades to plain text).
