# Pixel Parents — Progress Log (branch: `feat/verification-enforcement`)
*(Most recent updates at top)*

## Progress Update as of June 29, 2026 — 7:00 PM Pacific

### Summary of changes since last update
First commit on the branch: enforce student-email verification on the directory
(new families must verify to be listed; existing ones are grandfathered), add a
WhatsApp alternate verification path, a "verify later" affordance, and route
post-login to the dashboard so unverified families see the prompt.

### Detail of changes made:
- **lib/directory.ts** — `isFamilyVerified(row)` = `approvalStatus==="approved"` OR
  `createdAt < VERIFICATION_CUTOFF` (2026-06-30, when student verification shipped).
  `isDirectoryVisible` now also requires `isFamilyVerified`. Grandfathering keeps the
  live directory from emptying; new unverified families aren't listed until they
  verify. **Drop the cutoff for a hard gate once everyone's had time to verify.**
- **lib/directory.test.ts** — factory defaults to `approvalStatus:"approved"` so the
  sharing-gate tests stay focused; added a dedicated verification-gate describe
  (approved / grandfathered / gated-after-cutoff). 44 tests pass.
- **components/student-verify.tsx** — optional WhatsApp fallback link ("Message
  Daniel on WhatsApp") shown only when `NEXT_PUBLIC_DRODIO_WHATSAPP_URL` is set. No
  phone number is committed (public repo); the URL lives in env.
- **app/signup/thanks/page.tsx** — "I'll verify later — go to my dashboard →" link
  under the verify widget (when not yet approved).
- **Post-login → dashboard:** sign-in page defaults `forceRedirectUrl` to /dashboard
  (explicit `?redirect_url=` still honored); home "Log in" → /dashboard. So returning
  families land on the dashboard and see the verification card (graceful interrupt).
- **.env.example** — documented `NEXT_PUBLIC_DRODIO_WHATSAPP_URL`.
- Gates: tsc clean, eslint clean, vitest 140/140.

### Potential concerns to address:
- **Needs an env value:** `NEXT_PUBLIC_DRODIO_WHATSAPP_URL` must be set in Vercel
  (a `https://wa.me/<number>` link) for the WhatsApp option to appear. Until then it
  is hidden — nothing breaks.
- **Grandfather cutoff** is a deliberate safety valve. If Daniel wants a hard gate
  (all unverified families hidden), remove the `createdAt < CUTOFF` branch — but
  first confirm existing families have verified, or de-listing them is intended.
- "API access entails verification": not yet wired to set approvalStatus on API
  approval. Could add so API-approved families auto-list. (Follow-up.)
- The "graceful interrupt" is the dashboard verification card + the
  directory/community banners (no forced modal), reached via the new post-login
  redirect. If a harder interstitial is wanted, that's a follow-up.
