## Progress Update as of 2026-05-28 10:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adds one-shot diagnostic logging to `eval-pipeline.ts` to figure out
why per-phrase citations are still landing empty in prod even after the
prompt was tightened (PR #126). Two re-scores in a row (Nazar Gulyk,
Meruzhan Danielyan) both produced `citations: []` on every row despite
row-level `sources` containing real third-party URLs.

The diagnostic logs:
- Per-row citation counts in the RAW extracted JSON (before zod parsing).
- The raw `founderBreakdown[0].citations` payload (full shape) so we can
  see what the AI is actually emitting.
- Per-row citation counts in the PARSED object (after zod).

If RAW has citations and PARSED doesn't → zod's `.catch([])` is silently
discarding them due to a shape mismatch. If RAW is also empty → the
model genuinely isn't emitting citations and the prompt needs more work
(or we need to escalate to structured-output enforcement).

### Detail of changes made:
- `src/lib/eval-pipeline.ts` parse loop: extracts the raw object once
  (instead of feeding `extractJsonObject(gen.text)` directly to zod),
  logs the citation-count summary + first-row sample, then parses and
  logs the post-parse counts.

### Potential concerns to address:
- Logging will fire on EVERY scoring run while shipped. Cheap (a single
  `console.log`) but worth removing once we figure out the root cause.
- The PRD does not change the schema, prompt, or persisted data. Pure
  observability. Safe to merge ahead of any user-facing iteration.
