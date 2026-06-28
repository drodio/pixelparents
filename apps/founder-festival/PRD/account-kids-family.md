## Progress Update as of 2026-06-06 01:07 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New **Kids & Family** section in the account (claimed profiles only): add/edit/remove family members with relationship, name, birthdate (age computed), interests (shared pill pool + type-your-own), an owner-gated photo, and per-member visibility (all claimed users / specific users via name search). v1 captures + stores everything; there's no surface yet for viewing family members others shared with you (that comes with the event features). Built deploy-safe so it can merge before the prod migration is applied.

### Detail of changes made:
- **Schema** (`src/db/schema.ts`): `family_members` (owned by `evaluation_id`) + `family_member_viewers` (allow-list for "specific" visibility).
- **Migration**: `scripts/apply-family-tables.ts <dev|prod>` — idempotent `CREATE TABLE IF NOT EXISTS` + indexes, with the prod-host (`ep-fragrant-surf`) safety check, mirroring `apply-canonical-industries.ts`. **Applied to dev** (host ep-old-shadow). **PROD STILL NEEDS:** `npx tsx scripts/apply-family-tables.ts prod`.
- **Lib**: `src/lib/family-constants.ts` (DB-free: relationship options, `computeAge`, visibility, DTO) + `src/lib/family.ts` (owner resolution, CRUD with ownership checks, viewer allow-list, interest suggestion pool via `unnest`, claimed-user name search, deploy-safe `loadFamilyForAccount`).
- **APIs** (owner-gated): `GET/POST /api/account/family`, `PATCH/DELETE /api/account/family/[id]`, `POST/GET /api/account/family/[id]/photo` (Vercel Blob `put` + auth-gated byte-streaming serve), `GET …/interests`, `GET …/user-search`.
- **UI**: `FamilySection` (list + add/edit/delete + refresh) and `FamilyMemberForm` (modal: relationship→other, names, birthdate, interests pill-picker, photo, visibility + viewer name-search). Rendered in `account/page.tsx` only when `family.available` (claimed owner + tables exist).

### Verification:
- `tsc --noEmit` clean (family files); eslint clean; `tests/lib/family-constants.test.ts` passes (3).
- **Data layer verified against dev DB** (raw SQL mirroring the lib): insert member + viewer → list query → viewers join → interests `unnest`+group pool → claimed-user name search → cascade delete cleanup all correct. Test rows removed.
- `/account` serves 200 (no crash from the family load path).
- The auth-gated UI + photo upload/serve weren't browser-e2e'd (needs a Clerk session + a file); the blob route mirrors the existing working host-icon/sponsor-logo routes, and the data layer is verified.

### Potential concerns to address:
- **PROD migration required before it goes live**: run `npx tsx scripts/apply-family-tables.ts prod`. Until then the section is hidden on prod (deploy-safe via try/catch in `loadFamilyForAccount`).
- Photos are public-blob + random-suffix served through an auth route (URL never exposed) — not true private blob. Fine for v1; harden later.
- Interests pool is shared + unmoderated (per design).
- v1 only the owner can view a member's photo; the visibility allow-list is stored for the future "see others' families" / events surface.

### Update (rebased onto advanced main)
- Resolved a schema.ts merge (kept main's `admin_audit_log` + my family tables) and a migration-number collision: dropped my `0037`, regenerated as **`0038_motionless_shockwave.sql`** (family tables only) against main's baseline. Prod still applies via `npx tsx scripts/apply-family-tables.ts prod` (idempotent).
