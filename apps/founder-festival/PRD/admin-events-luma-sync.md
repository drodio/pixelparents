# Branch: `admin-events-luma-sync` — progress log

Branched from `main` (events-v1 era).

## Progress Update as of 2026-05-27 (merge + prod migration)
*(Most recent updates at top)*

### Summary of changes since last update
Applied the migration to PROD and merged latest `main` (branch was 90
commits behind).

- **Prod migration applied**: `events` gained `source`,
  `luma_event_id` (unique), `luma_url`, `cover_url` on the prod Neon
  branch (ep-fragrant-surf) — verified none→all-4 + unique index.
- **Merged origin/main.** Resolved:
  - Migration collision (main reached 0018) → dropped my
    `0014_rich_tigra`, regenerated as **`0019_sweet_aaron_stack.sql`**
    (identical 4 columns + index). Columns already live on dev+prod,
    so the file is journal bookkeeping only.
  - `/admin/events/page.tsx`: combined main's new **RBAC**
    (`can("create_events")`, `getViewerScopes`/`getViewerEmail` scope
    filter, gated New-event `<Link>`) WITH my Sync button + cover
    thumbnail + Source column. Sync + New are gated on `canCreate`.
  - schema.ts auto-merged (my events columns survived).
- Cleared local `.next`/`.turbo` (disk was full); typecheck clean
  after dev server regenerated Next route types.

### Note
- The shared dev DB had ~190 stray test events (other agents' test
  suites recreate them); my 5 Luma rows are present (source="luma").
  Not a prod concern.

---

## Progress Update as of 2026-05-26 10:30 PM Pacific
*(Most recent updates at top)*

### Summary
Pull the Founder Festival Luma calendar's events into `/admin/events`
so each shows as a row (alongside any manually-created events).

### How it works
- **Luma client** (`src/lib/luma.ts`): `listLumaEvents()` (paginated)
  + `lumaSlugFromUrl()`, typed `LumaEvent`. Read-only; auth via
  `LUMA_API_KEY` header.
- **Sync** (`src/lib/luma-sync.ts`): `syncLumaEvents()` lists Luma
  events and upserts each into `events`, keyed by `luma_event_id`
  (re-runs update in place — no dupes). Maps name/start/end/venue/
  description/cover/url; sets `source="luma"`, `status="open"`.
- **Route** `POST /api/admin/events/sync-luma` (admin-gated) → returns
  `{ synced }`.
- **UI**: `SyncLumaButton` on `/admin/events`; the list now shows
  cover thumbnail + title + slug, Starts, Status, and a **Source**
  column (Luma ↗ deep-link vs Manual).

### Schema (migration `drizzle/0014_rich_tigra.sql`)
Added to `events`: `source` (default "manual"), `luma_event_id`
(unique), `luma_url`, `cover_url`.

### Migration status
- DEV: applied (columns + unique index present).
- PROD: NOT applied yet — required before this deploys (the page
  selects the new columns; eval/insert paths would 500 on prod
  otherwise). Apply `drizzle/0014_rich_tigra.sql` to the prod Neon
  branch before merge.

### Done in this session
- Deleted all 663 pre-existing test events + dependents from dev.
- Created a private "Hello World" test event on Luma via the API and
  explored the update surface (join link ✓, photo = Luma-hosted only,
  physical address = text-only, color = unsupported).
- Initial sync populated dev: 5 events (4 real + Hello World).

### Notes
- Luma cover images render via lumacdn URLs (stored in `cover_url`).
- The untracked `public/Founder Festival CSV Template - Sheet1.csv`
  is NOT part of this branch (left untracked, not authored here).
