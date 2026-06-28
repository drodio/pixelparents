# Public family-member badges on the owner's profile

## Progress Update as of 2026-06-09 3:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Owners can now choose, per family member, whether/how to disclose them publicly on
their profile (a "Share publicly on my profile" picker in the add/edit form). The
chosen level renders as a gold pill on the profile — just the label, never the
name/photo/birthdate.

### Detail of changes made:
- Migration `0045_tranquil_jasper_sitwell.sql`: `family_members.public_share text default 'none'`.
  Apply via `node scripts/apply-public-share.cjs` (dev: .env.local; prod: pass
  `/Users/drodio/Projects/founder-festival/.env.prod.local`). MUST be applied to prod BEFORE
  deploy — `listFamilyMembersForOwner` does `SELECT *`, so a missing column degrades the whole
  family section to hidden (loaders are try/caught, so no 500).
- `family-constants.ts`: `PublicShare` type + `isPublicShare`, `publicShareOptions(rel, other,
  birthdate)` and `publicShareBadgeLabel(...)`. Levels: none | age_relationship
  ("12 year old daughter") | relationship ("Daughter") | generic ("Child", child rels only).
  Age option only appears when a birthdate yields an age.
- `family.ts`: `coerce`/`FamilyInput`/`toDTO` carry `publicShare`; new public, deploy-safe
  `getPublicFamilyBadges(evaluationId)` returns just the disclosure labels (newest first).
- `FamilyMemberForm.tsx`: "Share publicly on my profile" badge-radios below "Who can see this
  person"; default "Do not display publicly"; falls back to none if the chosen option no longer
  applies (e.g. age picked then birthdate cleared).
- `profile/page.tsx`: renders the labels as gold-outline pills directly under the achievement
  `<Badges>` row, visible to everyone.

### Potential concerns to address:
- Privacy: only the chosen label is exposed publicly; name/photo/birthdate/age-source stay
  gated by `visibility`. The age option discloses an exact age — that's the owner's explicit choice.
- `publicShare` is independent of `visibility`; an owner could publicly badge "Daughter" while the
  full record stays private. Intended.
