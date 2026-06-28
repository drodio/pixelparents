# Branch: `technical-writing-enricher` — dev.to as a structured technical-writing source

Partial answer to the operator's question about better technical-prowess
signal. See `PRD/technical-signal-questions.md` for the open questions
that need their input before we expand further.

## Progress Update as of 2026-06-03 04:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First slice of "better technical signal" shipped: dev.to enricher +
scoring rubric sub-rules + radar attribution. Lightweight, additive,
$0 cost. Picks up where the existing GitHub enricher leaves off — when
someone publishes technical writing they get up to +18 points in the
builder/technical bucket that don't depend on GitHub account age.

### Detail of changes made:
- `src/lib/enrichers/devto.ts` — identity-confirmed enricher against
  dev.to's public REST API. No auth, no cost. Identity gate accepts
  matches via (a) GitHub handle on the dev.to profile, (b) cross-
  platform handle (LinkedIn ↔ dev.to ↔ Twitter), or (c) strong full-
  name overlap. Anything weaker is rejected — precision-first per
  the NFX / GitHub policy.
- Returns: total article count, **technical article count** (via a
  curated tag whitelist — typescript / kubernetes / llm / postgres /
  etc.), total reactions, total comments, most-recent published date,
  top article (by reactions), top frequent tags.
- New `DEV.TO TECHNICAL-WRITING SUB-RULES` section in `scoring.ts`:
  +2 for confirmed presence, +6 for sustained technical writer (≥5
  technical articles), +6 for high-impact article (top ≥200 reactions),
  +4 for active in last 12 months. Cap +18 total per eval.
- `credibility-vectors.ts`: dev.to citation URLs and reason mentions
  ("dev.to author", "technical article") now route to the **technical**
  radar vector. Same for hashnode.com (future-proofing).
- 18 unit tests in `tests/lib/devto-enricher.test.ts` — tag
  classification, candidate-handle generation, identity confirmation,
  fact emission, failure modes.

### Potential concerns to address:
- Tag whitelist is human-curated; we under-count when authors use
  obscure tags ("postgresql-tuning" vs "postgres"). Conservative on
  purpose — false positives are worse than misses for a credibility
  signal.
- The identity gate may miss authors who don't link GitHub on dev.to
  and whose dev.to handle differs from their LinkedIn handle. Probably
  a small population in practice; revisit if we see misses.
- Open questions remain (rubric reweighting, personal-blog detection,
  Substack/Medium, Hashnode, GitHub contributionsCollection signal).
  Captured in `PRD/technical-signal-questions.md` for operator input.
