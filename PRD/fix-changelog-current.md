## Progress Update as of June 30, 2026 — 6:34 PM Pacific

### Summary of changes since last update
Fixed the public /changelog freezing at June 18. The page seeds from SEED_ENTRIES but only via seedIfEmpty(), which seeds ONLY when the table is empty. Production was seeded once (June 17-18, an older/shorter auto-seed batch with different slugs) and never backfilled, so every SEED_ENTRIES addition since then never appeared. Replaced the empty-only gate with ensureSeedEntries(), which runs the idempotent seedChangelog() (onConflictDoNothing by slug) once per cold start, backfilling any missing entries. Also added a "Resources" changelog category and two June 30 entries (community resource boards; files/pinning/editing).

### Detail of changes made:
- lib/changelog.ts: seedIfEmpty() -> ensureSeedEntries() (idempotent insert-missing, memoized per cold start); getChangelogEntries() now calls it. Added {slug:"resources"} to CHANGELOG_CATEGORIES. Added two SEED_ENTRIES dated 2026-06-30 (community-resource-boards feature; resource-board-files-pinning-editing enhancement).
- Seed entries keep notifiedAt=now() so backfilled rows never email subscribers.

### Potential concerns to address:
- ensureSeedEntries now re-adds a seed entry if it was manually deleted (no tombstone). Acceptable: the changelog is a curated showcase seed, not admin-edited per-entry today. If per-entry curation is added later, introduce a deleted-slug tombstone.
- Production backfill happens on the first /changelog read after deploy (cold start); verified post-deploy.
