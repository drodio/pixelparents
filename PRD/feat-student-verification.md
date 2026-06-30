# Pixel Parents — Progress Log (branch: `feat/student-verification`)
*(Most recent updates at top)*

## Progress Update as of June 29, 2026 — 4:05 PM Pacific

### Summary of changes since last update
First commit on the branch: self-serve OHS **student-email verification** (Daniel's
"Option B" from his MVP-tour video). A parent enters their OHS student's
`stanford.edu` email on the all-set page, we mail a 6-digit code, and confirming it
marks the whole family **approved** for the OHS directory. Existing/unverified
families are handled gracefully — a non-blocking banner on /directory + /community
and a dedicated `/verify` screen — so the ~18 families who signed up before
verification existed keep full access.

### Detail of changes made:
- **lib/verify.ts** (pure, unit-tested): `isStudentEmail` (accepts `stanford.edu`
  + any `*.stanford.edu` subdomain; rejects lookalikes like `stanford.edu.evil.com`),
  `normalizeEmail`, `generateCode` (crypto 6-digit, leading zeros kept), `hashCode`
  (sha256 — we never store the raw code), `checkCode` (no-code/expired/too-many/
  mismatch/ok), `CODE_TTL_MS`=10m, `MAX_ATTEMPTS`=5, `RESEND_COOLDOWN_MS`=30s,
  `PendingVerify` type. **lib/verify.test.ts**: 13 cases, all green.
- **Schema:** `children.student_email` (nullable text) added in
  lib/db/schema/signups.ts AND self-healed in `ensureFamiliesSchema()`
  (lib/db/ensure.ts: `ALTER TABLE children ADD COLUMN IF NOT EXISTS student_email`)
  so prod heals without a manual migration — same pattern as the families fix (#73).
- **Pending state + approval live in `signups.extra` jsonb** — NO new signups
  columns. While a code is outstanding: `extra.studentVerify` = PendingVerify. On
  success: `extra.approvalStatus='approved'` + `approvalBy='student-email'` +
  `approvalAt` + `verifiedStudentEmail`, applied to **every parent in the family**
  (by `family_id`, never resurrecting an admin-`denied` row), and the verified email
  is stamped onto the family's children. Reuses the existing approval model
  (lib/approval.ts) — added `readApprovalStatus(extra)` helper there.
- **Server actions** (app/signup/thanks/verify-actions.ts): `requestStudentCode`
  (validates domain, cooldown, stores hash, sends email), `confirmStudentCode`
  (checks code, approves family), `getVerifyState` (hydrates the widget/screen).
- **Email:** lib/email.ts `sendStudentVerificationCode` — code email from the
  hello@ VERIFY_FROM address so a stanford.edu inbox accepts it.
- **UI:** components/student-verify.tsx (client widget: email → code → verified,
  resumes mid-flow); components/unverified-notice.tsx (non-blocking banner).
  Wired into app/signup/thanks/page.tsx (all-set page), and a new
  app/(authed)/verify/page.tsx ("you're unverified" screen, Clerk-gated). Banner
  added to /directory + /community (they now capture the viewer's signup to read
  approvalStatus; access is NOT gated on it — purely a nudge).
- Theme matches the site (amber accent, emerald success). Verified all 5 UI states
  via a throwaway Tailwind-CDN preview + real-Chrome screenshots (the Next dev
  server can't be browsed locally — Clerk dev keys redirect to clerk.example.com).
- Gates: `npm run typecheck` clean, `eslint` clean, `vitest` 135/135 pass.

### Potential concerns to address:
- **End-to-end not yet tested on prod.** Local can't exercise it (no DATABASE_URL /
  RESEND, and BotID blocks automated signup). Plan: after merge + deploy, test with
  a real `ohs.stanford.edu` student address (the code forwards to the tester's gmail).
- Allowed domains are `stanford.edu` + subdomains. If OHS students use a different
  domain, widen `isStudentEmail`.
- Verification = approval here. Admins can still deny in /admin/verify; a `denied`
  row is never auto-approved by a later code confirm.
- Banner is intentionally non-blocking. If Daniel wants a hard gate later, flip
  /directory + /community to require `approvalStatus==='approved'` — the plumbing
  (viewerStatus) is already in place.
