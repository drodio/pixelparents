# Branch: `score-items-interactive-ui` — progress log

Branched from `main` (post fix-prod-pollution-and-ai-hardening merge via
PR #19). Recovers the Phase 2 score-items UI work that was stashed when
the original branch was deleted post-merge.

## Progress Update as of 2026-05-23 3:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 2 of the per-item score data model: rebuilds ScoreTable.tsx around
the new score_items DB rows with a confidence circle UI (red < 50 / orange
50-74 / blue 75-99 / green = confirmed-100 / red strike on rejected-0) and
inline confirm / modify / reject actions for fully-registered owners. New
POST /api/score-items/[id] endpoint applies the action with owner gating.
Welcome page auto-backfills score_items rows from the legacy breakdown JSON
inside a pg_advisory_xact_lock so concurrent page loads can't duplicate
rows.

### Detail of changes made:
- `src/components/ScoreTable.tsx` — full rewrite from the green-check stub.
  New `ConfidenceCircle` component, `ItemRow` with inline edit textarea,
  Section component pulls rows from score_items shape (`{id, points,
  reason, source, status, confidence}`).
- `src/app/(authed)/welcome/page.tsx` — `loadScoreItems()` reads
  score_items table; if empty for this eval, materializes rows from the
  legacy `evaluations.breakdown` JSON inside a transaction with an advisory
  lock keyed off the eval id. Idempotent — subsequent loaders see the
  inserted rows and skip the seed branch.
- `src/app/api/score-items/[id]/route.ts` — new POST endpoint. Body:
  `{action: "confirm"|"reject"|"modify", reason?, points?}`. Owner-gated
  via users.matchConfidence in (high, medium). Modify preserves
  original_reason / original_points so the admin queue can show the diff.

### Operator follow-up before merging this PR:
- **Apply `drizzle/0001_furry_ulik.sql` to the prod Neon branch (main).**
  The migration only ran on the dev Neon branch (ep-old-shadow) during
  Phase 1 smoke testing. Without it on prod, every page load of /welcome
  will 500 because the welcome query selects summary_source / score_items
  columns that don't exist yet on prod.

### Potential concerns to address:
- Backfilled score_items rows for legacy evals get confidence=50 (the
  default). They'll all render as orange circles until each eval is
  re-scored with the new rubric. Consider triggering a bulk re-score after
  this PR ships if the orange-everywhere look feels broken.
- Admin pending-review queue (Phase 3) not yet built — modified rows go to
  status='pending' but there's no UI to surface them to admins. They can
  still be queried via SQL.
- "+ Add another" button for adding new founder/investor rows is not in
  this PR — only confirm / modify / reject for existing rows.
