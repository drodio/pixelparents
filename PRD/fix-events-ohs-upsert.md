## Progress Update as of June 30, 2026 — 6:37 AM Pacific

### Summary of changes since last update
Hotfix: the OHS event importer crashed with Postgres 42P10 because `upsertOhsEvents` did `ON CONFLICT (external_key)` while the unique index on `external_key` is PARTIAL (`WHERE external_key IS NOT NULL`). Added `targetWhere` to the drizzle upsert so Postgres can infer the partial index. Verified by running the live import: parsed + upserted 20 real OHS 2026-27 events.

### Detail of changes made:
- `lib/db/events.ts` `upsertOhsEvents`: added `targetWhere: sql\`external_key is not null\`` to `.onConflictDoUpdate`, matching the partial unique index. One-line behavior-preserving fix.

### Potential concerns to address:
- None; the daily cron + manual script both work now. The partial index design is intentional (user events keep null keys, OHS events de-dup by key).
