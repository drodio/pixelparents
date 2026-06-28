## Progress Update as of 2026-05-28 11:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
DROdio re-scored drodio's profile on prod and citations DID land (11
gold underlines, ~10 rows with citations) but missed obvious-looking
ones. Investigation found the prompt had an internal contradiction the
AI was resolving by emitting nothing.

The bug: in the previous prompt
1. HARD RULE: "if sources is non-empty, citations must be non-empty.
   Every URL in sources must appear in at least one citation entry."
2. ALSO: "Do NOT cite phrases backed only by the subject's own LinkedIn
   page text."

For a row with mixed sources like `["linkedin.com/...", "flippa.com/..."]`,
the AI couldn't satisfy both rules so it emitted citations: [] entirely.
Same for `["drodio.com/...", "flippa.com/..."]` where the AI treated
drodio.com as "subject's own site".

The fix: drop the LinkedIn-exclusion rule. Citations are now pure
bookkeeping — map every URL in sources to the phrase it backs. The
existing `verification` tier already records HOW credible a row is
(authoritative / corroborated / single-source / self-asserted) — that's
the right place for the credibility judgment. Citations don't need to
duplicate it.

### Detail of changes made:
- `src/lib/scoring.ts` PER-PHRASE CITATIONS section rewritten:
  - New framing: "PURE BOOKKEEPING — they map each URL already in the
    row's sources array to the substring it backs". Not a credibility
    judgment.
  - HARD RULES collapsed to two: empty sources → empty citations,
    non-empty sources → non-empty citations. No other reasons to skip.
  - "Cite from EVERY URL in sources — including LinkedIn URLs, the
    subject's own site, podcast pages, anything. It's the reader's job
    to evaluate the source; our job is to surface it."
  - Added fallback rule: "If the URL backs the whole reason, cite the
    WHOLE reason as the phrase — never skip a URL just because no
    specific phrase obviously fits."
  - Replaced the Y Combinator example with one showing mixed sources
    (LinkedIn + Flippa-style podcast) cited together on one phrase, so
    the AI has a concrete template for the previously-confusing case.

### Potential concerns to address:
- This makes the citation UI show LinkedIn back-links — clicking the
  underlined phrase opens LinkedIn. Mildly self-referential for users
  viewing their own profile (they came FROM LinkedIn), but no harm.
- The next re-score should be DEFINITIVE. If a row still has sources
  but empty citations after this, the model is either (a) ignoring the
  prompt entirely or (b) emitting citations in a shape the schema
  silently drops — the citation-diag logs from PR #127 will tell us.
- Cleanup: PR #127's diagnostic logs are still in eval-pipeline.ts.
  Remove once we've confirmed citations land reliably across multiple
  re-scores.
