## Progress Update as of July 9, 2026 — 3:08 PM Pacific

### Summary of changes since last update
First entry. Makes GoPixel community-agnostic (parents / students / alumni), on
top of the rebrand branch. Adds a first-class ALUM member type, a community-framed
landing page, and a 3-way directory perspective (Parents / Students / Alumni).
Stacked on chore/rebrand-gopixel. tsc / lint / 869 tests / build all green.

### Detail of changes made:
- ALUM role: lib/options.ts ACCOUNT_TYPE += "alum"; lib/family-display.ts gains
  isAlumAccount + memberTypeOf ("parent"|"student"|"alum"). An alum is an ADULT
  member — NOT age-gated (isStudentAccount stays false), no parent-link.
- Signup: 3-way role selector (parent / current student / alum) with an alum hint;
  accountType type widened everywhere; sanitizeSignupPatch already accepts it via
  oneOf(ACCOUNT_TYPE). Continue button label + thanks-page step-2 heading are
  alum-aware (alum uses the parent path with optional children).
- Directory: DirectoryCard gains isAlum; buildDirectoryCard sets it. showcase-client
  now has a 3-way perspective toggle (Parents/Students/Alumni, live counts, hides
  empty buckets, defaults to the viewer's own kind with populated-fallback);
  directory/page passes viewerMemberType at all render sites. NOTE: this SUPERSEDES
  the 2-way toggle in PR #186 (feat/directory-perspective) — close #186 in favor of
  this, or expect a showcase-client conflict.
- Landing: hero reframed from parent-centric ("Join N other GoPixel", a broken
  rebrand artifact) to "Join N in the Stanford OHS community" + "Where OHS parents,
  students, and alumni connect around N shared interests"; CTA → "Join GoPixel
  free". Dropped the now-unused kidsCount fetch.

### Potential concerns to address:
- Supersedes #186 (see above) — resolve at merge.
- Alum currently rides the parent step-2 (children optional) rather than a bespoke
  alum flow; fine for v1, revisit if alumni need a distinct onboarding.
- Deeper copy is still parent-leaning in places ("families", some headers); a full
  content pass to "members/community" is a follow-up.
- Small transition items NOT done here (flagged): OAUTH_ISSUER env → gopixel.org
  (invalidates existing dev tokens — deliberate hold), and renaming
  public/sign-in-with-pixelparents.js → …gopixel.js + refs.
