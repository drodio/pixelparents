## Progress Update as of [July 1, 2026 — 1:40 AM Pacific]

### Summary of changes since last update
First entry for this branch. Updated user-facing copy that refers to the OHS
young people in the community/directory/social-proof/matching sense from
"kids" → "students", while deliberately KEEPING "child/children" everywhere the
word carries the family-membership meaning (a family's children can include
non-OHS younger siblings), the parenting-voice marketing framing, legal/minor-
safety copy, and all code identifiers. Copy-only; no logic, routes, DB, or
exported symbols touched.

### Detail of changes made:
- CHANGED to "students" (OHS-community / directory / matching / social-proof):
  - `app/page.tsx` — landing headline "Connect with N OHS kids" → "OHS students".
  - `app/signup/page.tsx` — signup headline "connect with N OHS kids" → "OHS students".
  - `app/signup/thanks/family-form.tsx` — notes placeholder "activities … with
    other OHS kids & families" → "other OHS students & families" (matching sense).
  - `app/(authed)/family/invite-card.tsx` — SpreadTheWord card "the more our kids
    can connect around what they love" → "the more our students can connect …".
- KEPT "child/children" deliberately (judgment calls):
  - Stat-tile labels "Children" in `app/(authed)/directory/stat-strip.tsx` and
    `app/(authed)/dashboard/page.tsx`. A documented code comment explains the tile
    counts `total_children` INCLUDING siblings marked "Not an OHS child", so
    "Children" is truthful and "Students"/"Kids at OHS" would overstate OHS
    enrollment. Changing it would reintroduce the exact overstatement the code
    guards against.
  - `components/profile-view.tsx` "Children at OHS" section — the list renders ALL
    of a family's children, explicitly including "Not an OHS child" entries with an
    age, so "child" is the accurate umbrella word for the mixed list.
  - Parenting-voice / future-of-work marketing framing: `app/builders/page.tsx`
    ("your kid", "our kids will graduate", "software for our kids", "our children
    are heading into"), `app/p/[token]/page.tsx` + `app/signup/page.tsx` meta
    descriptions ("software for our kids"), `components/irl-tooltip.tsx` ("slang
    our kids use"), `lib/email.ts` co-parent invite ("our kids' educational
    experience"). These are parents speaking about their own children broadly, not
    the community-directory/matching sense.
  - Family editor / membership copy: `app/(authed)/family/invite-card.tsx`
    ("share the same kids", "your child's other parent"), all family-form and
    admin children-table / per-child editor strings ("Add a child", "Your child's
    interests", "Photos of this child", "Children" admin nav, etc.),
    `app/developers/page.tsx` ("encourage your child(ren) to code").
  - Legal / minor-safety: `app/privacy/page.tsx` ("Children's information",
    "child(ren) at OHS"), `components/faq-dialog.tsx` ("children's full names").
  - All CODE: `children` DB table/columns, `childId`/`familyId`, props (`kids`,
    `children`), variable names, `kid` in JWKS/OAuth (`kid` = key id, unrelated),
    comments, and test fixtures/assertions.
- `lib/changelog.ts` SEED_ENTRIES scanned — no "kids"/"children" copy present, so
  no changelog seed edits.

### Potential concerns to address:
- The four changed headlines/placeholders derive their number from
  `getChildrenCount()` (`lib/db/signups.ts`), which counts the whole `children`
  table INCLUDING non-OHS siblings. The pre-existing copy already labeled that
  count "OHS kids", so "OHS students" is the direct parallel and no worse than
  before — but strictly the figure can include a few non-OHS siblings. The
  neutral stat tiles ("Children") remain the data-truthful surface.
- `next build` intentionally NOT run in the worktree (per conventions). Validated
  with `npx tsc --noEmit`, `npm run lint`, `npm test`.
