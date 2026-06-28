## Progress Update as of 2026-06-01 10:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Shipped **Project 2 (event badge labels)**. A "🏷️ Print badges" button on the
admin event page opens a print-ready sheet (one CSS page per badge, 90mm × 62mm
landscape for the QL-800's 62mm DK-2251 tape) with name + company + a red mini
spider chart + a QR to each attendee's profile.

### Detail of changes made:
- `src/lib/qr.ts` — `qrSvg()` (server-side QR → inline SVG; new dep `qrcode`).
- `src/lib/event-badges.ts` — pure helpers: `pickBadgeDimension` (canonical role
  via slugKind → higher score → founder), `badgeCompanyName` (same preference as
  leaderboard), `buildBadgeData`, and testable radar geometry (`radarVertex` /
  `radarRing` / `radarShape`). 9 unit tests.
- `src/components/BadgeRadar.tsx` — static, non-interactive mini radar; person
  polygon in red (#e2231a) for the two-color label, grid in black.
- `src/components/admin/AutoPrint.tsx` — fires `window.print()` on mount.
- `src/app/(authed)/admin/events/[id]/badges/page.tsx` — guarded print route;
  `?status=` (default approved); builds badges from applicants+evals; embeds
  `@page` CSS.
- `admin/events/[id]/page.tsx` — added the "Print badges" link carrying the
  current status filter, opens in a new tab.
- Verified: `next build` compiles (route `/admin/events/[id]/badges` registered);
  full suite 539 passed / 24 pre-existing failures (unrelated migration).

## Progress Update as of 2026-06-01 10:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Shipped **Project 1 (pipeline enrichment)**. The DB now stores a clean,
structured `profile.identity` block on every fresh score/re-score, replacing the
read-time "guess company name from a domain" hack.

### Detail of changes made:
- `src/lib/identity.ts` — `Identity` type + pure `buildIdentity()` priority-merge
  (LLM identity → enricher raw payloads → deterministic fallbacks). 10 unit
  tests in `tests/lib/identity.test.ts`.
- `src/lib/scoring.ts` — added `SCORING_IDENTITY_SCHEMA` (nullable + `.catch`
  defensive, defaults to empty) to `SCORING_SCHEMA`, plus an `==== IDENTITY ====`
  rubric section telling the model what to emit.
- `src/lib/eval-pipeline.ts` — mirrored the field in `SCHEMA_HINT`; calls
  `buildIdentity()` in `payloadToWriteFields()` → writes `profile.identity`.
- Read-time consumers (`profiles-scored.ts`, `leaderboard.ts`) now prefer
  `profile.identity.companyName`, with the old firm/domain guess as fallback.
- `scripts/backfill-identity.ts` — reconstructs identity for old rows from
  already-stored data (no LLM cost); dry-run by default, `--commit` to write.
- Fixed `tests/lib/scoring.test.ts` fixture to include the new `identity` field.

### Detail of changes made (initial setup):
Brainstormed and wrote the combined design spec for two
sequenced projects: (1) pipeline enrichment — promote rich identity data we
already fetch into a clean `profile.identity` block; (2) event badge labels — a
"Print badges" route for the Brother QL-800 (62mm continuous, two-color) that
renders attendee name + company + QR + spider chart.

### Detail of changes made:
- Spec at `docs/superpowers/specs/2026-06-01-event-labels-and-enrichment-design.md`.
- Project 1 stores a structured `Identity` object in the existing `profile`
  JSONB (no migration). Extraction = LLM `identity` block in the scoring schema
  + a pure `buildIdentity()` priority-merge over enricher data + fallbacks.
- Project 2 uses an HTML print route (CSS `@page` sizing) + browser print, so
  it reuses the existing radar SVG and gets two-color red for free. New dep:
  `qrcode`.
- No DB schema migration in either project.

### Potential concerns to address:
- Pre-existing test baseline failures (`column "find_email_queued_at" does not
  exist`) come from a pending migration on the shared dev DB — UNRELATED to this
  branch. Must be resolved before merge, but not by this work.
- Backfill script touches a real DB; it is NOT run automatically (separate
  dev/prod Neon DBs; never `db:push` from a checkout). Ops runs it.
- `getCredibilityRadars` reads a cached population snapshot; verify it's cheap
  per-attendee when rendering many badges at once.
