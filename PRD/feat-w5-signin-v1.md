# Pixel Parents — Progress Log (branch: `feat/w5-signin-v1`)
*(Most recent updates at top)*

## Progress Update as of June 30, 2026 — 1:56 PM Pacific

### Summary of changes since last update
First entry. Built **"Sign in with Pixel Parents" V1** on top of the merged MVP —
the full OIDC provider: an **approval gate** that keeps unapproved apps from
signing anyone in, **three new scopes** (`role`, `grade_band`, `family`) with
student/minor coarsening, **pairwise per-client `sub`** + **HMAC'd `family_id`**
(no cross-app correlation), a **`/userinfo`** endpoint, **refresh tokens** with
rotation + reuse-detection + an RFC 7009 **`/revoke`** endpoint, **remembered
consent**, and a **Connected-apps / consent-revocation panel** on the account
page. The MVP auth-code + PKCE flow still works; this extends it. `npx tsc
--noEmit`, `npm run lint` clean; **504 tests pass** (+51 new oauth tests); `npm
run build` verified by patch-applying into the main checkout (the worktree's
symlinked node_modules trips Turbopack), then restoring the main checkout
pristine.

### Detail of changes made
- **Approval-gate (top ask)** — a Sign-in app (`oauth_clients`) is LIVE only once
  approved. Two paths, both reusing existing trust state:
  - `lib/oauth/gating.ts` (pure, tested): `clientLiveness(client, ownerApiApproved)`
    → live if `status='approved'` (admin approved the client), if the OWNING
    developer's API access is approved (`api_keys.status='approved'`), or legacy
    `status='active'` (MVP rows grandfathered). `'pending'`/`'rejected'` are not
    live. `developerFacingStatus` collapses to live/pending/rejected for the UI.
  - `lib/oauth/owner-approval.ts`: `ownerApiAccessApproved(ownerClerkUserId)` —
    fail-closed bridge to `getRequestByClerkUser` (a DB hiccup → NOT live).
  - New apps now register as **`status='pending'`** (was MVP self-serve `'active'`).
  - Gate enforced INDEPENDENTLY at `/oauth/authorize` (shows a "pending approval"
    / "rejected" card, issues no code), in the consent server action, and at
    `/api/oauth/token` (403 `invalid_client` for a non-live app). Extra-scrutiny:
    apps requesting minor-data scopes (`ohs_verified`/`role`/`grade_band`) are
    flagged in the dev register UI and the admin queue (`requestsMinorData`).
- **New scopes + coarsening** (`lib/oauth/claims.ts`, tested):
  - `role` → `parent | student | alumni` (`extra.accountType==='student'` →
    student; `ohs_affiliation`===alumni label → alumni; else parent).
  - `grade_band` → `middle | high` ONLY (7th/8th→middle, 9th–12th→high), **never**
    the exact grade; emitted only for a STUDENT subject (a parent never gets a
    grade band — don't mix a minor's data into a parent token). `gradeBandOf` +
    `studentGradeBand` + `candidateGradesForStudent` (prefers the student's OWN
    linked grade via verified-email match, falls back to family kids).
  - `family` → HMAC'd `family_id` (see pairwise below).
  - `ohs_verified_method` (`student_email | admin | grandfathered`) derived from
    the SAME `extra.approvalBy`/grandfather provenance the app already records.
  - Every claim stays scope-gated (no scope ⇒ no claim); `ohs_verified` still
    reads `lib/directory.isFamilyVerified` (no re-implementation, no false
    positives).
- **Pairwise `sub` + HMAC'd `family_id`** (`lib/oauth/secrets.ts`, tested): both
  are `HMAC(pepper, clientId ‖ value)` so the same user/family gets a DIFFERENT,
  stable, non-reversible id per client (apps can't collude to correlate or
  de-anonymize a student). Pepper is derived from `OAUTH_PRIVATE_KEY` (env-only,
  already required by the signer) so no new secret to manage; throws if unset
  (never emits a guessable id). `discoveryDocument` now advertises
  `subject_types_supported: ["pairwise"]`.
- **`/api/oauth/userinfo`** — verifies a Bearer access token we minted (RS256, our
  public key via new `keys.getVerifyKey()`), returns `sub` + the scope-gated,
  coarsened claims (rebuilt from the user's signup so they stay current). The
  access token now carries a private `pp_email` claim (the user's own email only —
  never the global Clerk id) so userinfo can rebuild PII claims. 401 +
  WWW-Authenticate on a bad/expired token.
- **Refresh tokens + rotation + reuse detection** (`oauth_tokens` table,
  `lib/oauth/store.ts`, tested): opaque `ppr_live_` token, hashed at rest, issued
  at code exchange. `rotateRefreshToken` mints a successor in the same `chain_id`,
  marks the old one rotated; replaying an already-rotated/revoked token = REUSE →
  **revokes the entire chain** → `/token` returns `invalid_grant`. `/token` now
  also handles `grant_type=refresh_token` (re-resolves email from the stored grant
  so `ohs_verified` etc. stay current; nonce omitted on refresh). 30-day window
  from first issue (refresh can't extend a grant forever).
- **`/api/oauth/revoke`** (RFC 7009): client-authenticated; revokes a refresh
  token's whole chain; idempotent 200 even for unknown/already-revoked tokens.
- **Remembered consent** (`oauth_consents` table): on Allow we `recordConsent`;
  the authorize page skips the screen and issues a code directly when a live
  consent COVERS (superset of) the requested scopes (`lib/oauth/consent.ts`,
  tested) — any NEW scope re-prompts. The fast-path server action re-validates +
  re-gates (UX hint, not the security boundary).
- **Account-page Connected-apps panel** (`app/(authed)/account/connected-apps-*`):
  lists each authorized app, what it can see (scopes in plain language), and a
  Revoke button → revokes the grant + burns its refresh tokens. Keyed to the
  caller's Clerk user (can only revoke their own grants).
- **Developers tab**: each app now shows a Live/Pending/Rejected badge + the new
  scope checkboxes (minor-data flagged) + a banner explaining apps stay pending
  until API access is approved. **Admin queue** at `/admin/oauth-apps` (added to
  admin-nav) to approve/reject pending apps, flagging minor-data requests.
- **Schema** (`lib/oauth/ensure.ts`): self-healing DDL for `oauth_tokens` +
  `oauth_consents` (+ idempotent ALTERs for `oauth_clients.decided_at/by` +
  `reject_reason`), all in the feature's own ensure — shared `lib/db/ensure.ts`
  untouched. Read/write paths call `ensureOAuthSchema()` first (country-column
  lesson).
- **Tests (+51, 504 total):** gating (every approval path), pairwise sub +
  HMAC family_id (stability + per-client unlinkability + non-reversibility),
  grade_band coarsening (incl. parent-gets-none + no exact-grade leakage), role,
  verified-method, consent coverage, refresh-token generation, access-token
  verify round-trip. Existing oauth tests updated for the new `clientId` /
  client-row columns.

### Potential concerns to address
- **Pepper tied to `OAUTH_PRIVATE_KEY`:** rotating the signing key rotates every
  `sub`/`family_id`. Acceptable (relying apps re-key on next sign-in, the standard
  provider-rotation behavior) and documented in `secrets.ts`, but if a key-rotation
  runbook lands, give the pepper its own optional env var so identifiers survive a
  signing-key rotation.
- **`build` not runnable in-place** in this worktree (symlinked node_modules trips
  Turbopack); verified via patch-into-main-checkout then restore. Committed change
  is source only.
- **`grade_band` for an unlinked student:** if a student account's verified email
  doesn't match any child row, we fall back to banding any OHS grade among the
  family's kids — could be a sibling's. Best-effort; still only a band, never an
  exact grade. Could tighten to "omit unless the student's own grade resolves."
- **`/userinfo` freshness vs. the ID token:** userinfo rebuilds claims live from
  the signup; the ID token reflects the auth moment. Apps that need the freshest
  verified state should call userinfo. Documented intent.
