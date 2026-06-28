# Kids & Family — design

Account section (claimed profiles only) to add family members, for future
family-oriented event matching. v1 = capture + store + manage; no surface for
viewing family members *others* shared with you (that comes with events).

## Decisions (from brainstorming)
- **Birthdate** (full date) stored; age is computed (never goes stale).
- **Photos private/owner-gated**: public Vercel Blob + random suffix, but served
  only through an auth-checked route that streams the bytes (raw URL never sent).
- New members default to **private** ("specific" visibility, no viewers).
- **Interests** = shared, unmoderated free-text pool (suggestions = distinct tags
  across all members).
- Scope: management side only; viewing-others is future.

## Data model
- `family_members` (owned by `evaluation_id` = the claimed profile):
  relationship (daughter|son|child|partner|spouse|family-member|other) +
  relationship_other; first_name (req) / last_name; birthdate (date);
  interests text[]; photo_url (server-only blob URL); visibility
  ("all_claimed"|"specific", default "specific"); timestamps.
- `family_member_viewers` (member_id → viewer_evaluation_id): allow-list for
  "specific" visibility (empty = private to owner). "all_claimed" = no rows.

## Surfaces
- Account page renders `<FamilySection>` only when the user is a claimed owner
  **and** the tables exist (deploy-safe — `loadFamilyForAccount` catches the
  missing-table case so prod doesn't 500 before the migration).
- `FamilyMemberForm` modal: relationship dropdown (→ free text for Other),
  first/last name, birthdate, interests pill-picker (suggestions + type-your-own),
  photo upload, visibility radio + name-search viewer picker.

## APIs (owner-gated)
- `GET/POST /api/account/family`, `PATCH/DELETE /api/account/family/[id]`
- `POST/GET /api/account/family/[id]/photo` (upload to private-served blob)
- `GET /api/account/family/interests` (suggestion pool)
- `GET /api/account/family/user-search?q=` (claimed users by name)

## Migration
Manual (no auto-migrate). `scripts/apply-family-tables.ts <dev|prod>` (idempotent
CREATE TABLE IF NOT EXISTS, prod-host safety check). Applied to dev; **prod is a
deploy step** the operator runs: `npx tsx scripts/apply-family-tables.ts prod`.

## Out of scope (v1)
Viewing others' shared family members; interest moderation; true private blob
(public+random-suffix + auth-gated streaming is the v1 compromise); row-level
photo access for non-owners (only owner views in v1).
