# feat/w2-growth-invites — Growth flywheel via invites

## Progress Update as of June 30, 2026 — 6:19 AM Pacific

### Summary of changes since last update
First entry. Lit the growth flywheel with three shareable invite surfaces, all
built ON TOP of the EXISTING co-parent invite infrastructure (the family
`inviteToken`, `joinUrlFor`, `sendCoParentInvites`, and the `/signup/join/[token]`
flow) — NO new tables, NO new secrets, NO schema changes. Added a prominent,
warm "Grow your community" section to the Family tab with copy-to-clipboard
links + email; a public "spread the word" referral link that pulls brand-new OHS
families into `/signup`; a verification-gated student-to-student referral link;
and a light-touch invite CTA on the signup thanks page. Referral attribution is
recorded in the existing `extra` jsonb (`referredBy`). `tsc --noEmit`, `eslint`,
and `vitest` (352 tests, incl. 10 new) all pass; `npm run build` verified clean
via the main checkout (worktree build fails on the node_modules symlink, as
expected). NOTE: retention notifications are intentionally OUT OF SCOPE (deferred).

### Detail of changes made:
- **`lib/referral.ts` (new)**: pure, testable referral-link layer. `REFERRAL_PARAM`
  (`ref`) + `REFERRAL_AS_PARAM` (`as`); `sanitizeRefToken()` (base64url charset,
  ≤64 chars, never throws — bounds what a hostile `?ref=` can put in `extra`);
  `signupReferralUrl(baseUrl, token, { student })` (pure URL builder, omits the
  param for a garbage token so no naked `?`); server wrappers
  `familyReferralLinkFor()` / `studentReferralLinkFor()` using `getBaseUrl()`.
  The referral code REUSES the family's existing hard-to-guess `inviteToken` — no
  new secret. The link grants no access; it's opaque attribution only.
- **`lib/referral.test.ts` (new)**: 10 unit tests covering token sanitization
  (valid, trim, non-string, empty, illegal chars incl. traversal/`<script>`,
  length cap) and URL building (family link, student `as=student`, trailing-slash
  strip, garbage-token omission).
- **`lib/family.ts`**: added `getInviteTokenForFamily(familyId)` so server pages
  can build a family's join/referral links from the family id (self-heals schema
  first, same pattern as the rest of the file).
- **`app/(authed)/family/invite-card.tsx` (new, client)**: three on-theme
  (dark/amber, design tokens, accessible focus rings) cards + a shared `CopyLink`
  (mirrors the share-settings clipboard pattern, graceful fallback to manual
  select):
  - `FamilyInviteCard` — co-parent invite. Shareable join LINK (copy) PLUS the
    existing email send via `sendCoParentInvites`. Warm copy, partial-send aware.
  - `SpreadTheWordCard` — "Invite another OHS family". Copyable public referral
    link to `/signup?ref=…`.
  - `StudentReferralCard` — student-to-student referral. Copyable link to
    `/signup?ref=…&as=student`; privacy-safe (no PII, just the ref token).
- **`app/(authed)/family/page.tsx`**: new prominent "Grow your community" section
  at the top of the hub. Resolves the family `inviteToken` (parallel with the
  existing interest/verify fetches), builds the three links, and renders the
  cards. Student referral card is VERIFICATION-GATED: only shown when at least one
  family member has a verified OHS student email (`verifiedEmailsOf` over members).
- **`app/signup/page.tsx`**: reads `?ref=` + `?as=student` from `searchParams`
  (Next 16 async searchParams), sanitizes the ref token, and threads
  `refToken` + `defaultAccountType` into `SignupForm`.
- **`app/signup/signup-form.tsx`**: new optional `refToken` + `defaultAccountType`
  props. `defaultAccountType` seeds the initial account type (student link →
  student flow). `refToken` is passed to `createDraftSignup(refToken)` via
  `ensureId`.
- **`app/signup/actions.ts`**: `createDraftSignup(refToken?)` now stamps a
  sanitized `extra.referredBy` on the brand-new signup (provenance for future
  credit). No-op when absent. Co-parent draft path unchanged.
- **`app/signup/thanks/page.tsx` + `thanks-invite-cta.tsx` (new, client)**:
  light-touch post-signup CTA — a copyable "invite another OHS family" referral
  link, resolved from the family's `inviteToken`.

### Potential concerns to address:
- **Referral credit is provenance-only**: `extra.referredBy` stores the referrer's
  family `inviteToken`. Nothing resolves/credits it yet — a future "who referred
  whom" report can join on it. Intentionally minimal (no new table, per scope).
- **Family join link is a bearer secret** (same as the pre-existing co-parent
  flow): anyone with the link can join the family and edit shared details. Copy
  states this. The "spread the word" / student links are SAFE to share publicly —
  they only carry an opaque attribution token and land on the normal signup.
- **Email send reuses the existing lifetime cap** (`INVITE_LIFETIME_CAP`) in the
  Family-tab card; no new outbound-email primitive was introduced.
- **Retention notifications are deferred** (explicitly out of scope for W2).
