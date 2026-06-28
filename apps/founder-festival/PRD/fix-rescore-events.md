# PRD — fix-rescore-events

## Progress Update as of 2026-06-05 10:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Bugfix follow-up to the events-as-recommendations work (PR #203): re-scoring a profile still produced PRIORITIES (advice), not events, because only the backfill path (Sonnet reframe in `event-recommendations.ts`) and the UI heading were changed — the **core scoring rubric** that the full Opus score/re-score uses was never updated. Now the rubric itself asks for proposed IRL Festival events, so every score and re-score generates events natively.

### Detail of changes made:
- **`src/lib/scoring.ts` (SCORING_RUBRIC)**: rewrote the `recommendations.summary` + `recommendations.items` instructions to produce 5-8 specific proposed IRL Festival events (dinners/office hours/roundtables/happy hours), each grounded in the profile, phrased as a concrete event starting with "A"/"An", keeping the specific hooks (YC batches, SPC, rankings, alumni networks). Same 6 categories, same schema. Also updated the `recommendations.items` confidence guidance to score event-match instead of priority-relevance.
- Schema (`SCORING_SCHEMA`) and `SCHEMA_HINT` unchanged — only the prompt prose changed, so no validation/shape impact.

### Verification done:
- `next build` compiles + typechecks.
- (Post-deploy) re-scoring any profile, e.g. /drodio, should now yield event-style items directly from Opus.

### Potential concerns to address:
- Two generators now share the same event framing: the main scoring rubric (Opus, full score/re-score) and `event-recommendations.ts` (Sonnet, cheap backfill of stored priorities). Keep their voices roughly aligned if either is tuned.
- Profiles scored before this deploy still show their old priority items under the new heading until re-scored or backfilled (forward-only long tail, as agreed).
