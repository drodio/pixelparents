## Progress Update as of 2026-05-28 08:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Per-phrase citations land. Score-breakdown reason text now decorates
AI-emitted phrases with a subtle gold underline; hovering opens a small
popover with source URLs; clicking the phrase opens all sources in new
tabs. (Cmd-clicking opens just the first.) Variant A from the citation
brainstorm.

### Detail of changes made:
- Schema: `score_items.citations jsonb default '[]' not null`. Migration
  `drizzle/0025_material_captain_marvel.sql`. Pushed to dev DB.
- `src/lib/scoring.ts`:
  - `SCORING_SCHEMA` adds `citations: Array<{ phrase, sources }>` to
    both `founderBreakdown` and `investorBreakdown`. Defaulted via
    `.default([]).catch([])` so prompt-output schema mismatches don't
    nuke the whole eval.
  - Prompt has a new "PER-PHRASE CITATIONS" section explaining how to
    emit citations, with examples and a rule that the phrase MUST appear
    verbatim in the reason. Self-asserted-only rows get empty citations
    by instruction.
  - New `sanitizeCitations(reason, citations)` filter drops AI-emitted
    phrases that don't actually appear in the reason — defense against
    hallucination at the persistence edge.
- `src/lib/eval-pipeline.ts`: when score_items rows are written, pass
  `citations: sanitizeCitations(row.reason, row.citations)` per row.
- `src/lib/decorate-reason.ts` (new): pure `decorateReason(reason,
  citations)` returns ordered `{kind: "text"|"phrase", text, sources?}`
  chunks. Handles overlap (outer/longer wins), repeated phrases (only
  the first decorated), missing phrases (silently dropped), empty inputs.
- `src/components/ReasonWithCitations.tsx` (new): client component
  rendering the chunks. Phrase chunks get `border-b border-amber-400/40
  hover:border-amber-300`; popover lists each source with a derived
  title + domain; both go gold on hover.
- `src/components/ScoreTable.tsx`: row reason now renders via
  `ReasonWithCitations` when `citations.length > 0`, else plain text.
  Graceful degradation for pre-existing rows.
- `src/app/(authed)/profile/page.tsx`: extended `ScoreItemRow` type and
  the `toRow()` mapper to include `citations`.
- Tests: 14 new tests in `tests/lib/decorate-reason.test.ts` covering
  ordering, overlap, missing-phrase, repeated phrase, empty inputs,
  edge positions; 5 new tests for `sanitizeCitations` in
  `tests/lib/scoring.test.ts` covering verbatim-match, empty-source
  drop, empty-phrase drop, case sensitivity. All 41 tests pass.

### Potential concerns to address:
- Pre-existing score_items rows have `citations: []` by default. They
  render as plain text until the profile is re-scored. No automatic
  backfill — would be expensive (re-score every eval to pick up
  citations). Worth a manual cron/admin action later if we want
  citations everywhere immediately.
- The popover derives a "title" from the URL path (e.g.
  `/clipboardhealth` → "Clipboardhealth"). The AI doesn't emit page
  titles. If we want better titles, the AI could emit them, or we'd
  need a server-side fetch of `<title>` per URL (costly). For v1 the
  domain on the right of each row is the real signal.
- The AI prompt got ~30 lines longer. Risk: subtle behavioral drift on
  other fields. Watching cost / output quality on the next batch of
  scoring runs is worth doing.
- The `citations` column is per-row on `score_items`, NOT mirrored to
  the legacy `evaluations.breakdown` JSON. Two reasons: (1) the legacy
  JSON is only kept for backward compatibility, (2) the renderer uses
  score_items as the source of truth. If something else still reads
  legacy breakdown, it won't see citations — that's intentional.
