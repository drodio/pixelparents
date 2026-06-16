# Pixel Parents — Approval-Gated API Keys (design spec)

**Date:** 2026-06-16
**Branch:** `main`
**Status:** Approved design, implementing

## 1. Goal

Replace instant self-serve API keys with an approval flow:
1. User creates a **Clerk account** up front (Clerk does email verification natively).
2. Signed in, they **request** an API key → request goes **`pending`**.
3. An **admin** approves or rejects in `/admin/api-requests`; the applicant gets
   an **email** either way.
4. If approved, the user reveals their **API key** on a Clerk-gated page.

Decisions (user-approved):
- **One gate:** every API endpoint requires an approved key (the old Test /
  OHS-Families tier split is retired).
- **Key delivery:** the raw key is **revealed once** on the key page after
  approval (never emailed); afterward only the prefix shows, with **Regenerate**.

## 2. Routes & files

- **Public `/developers`** (`app/developers/page.tsx`) — keep docs + red OHS
  notice; replace the open key console with a **"Request API access"** CTA → `/account`.
  (`app/developers/key-console.tsx` is removed.)
- **`/account`** (`app/(authed)/account/page.tsx`, + `request-form.tsx` client +
  `actions.ts`) — Clerk-gated single page that renders by request state:
  - none → request form ("what are you building?").
  - pending → "under review".
  - rejected → "declined" (+ optional reason).
  - approved → reveal-once key + Regenerate + endpoint docs.
- **`/admin/api-requests`** (`app/(authed)/admin/api-requests/page.tsx`, already a
  stub + nav link) — list requests (pending first); **Approve** / **Reject(reason)**
  server actions (`app/(authed)/admin/api-requests/actions.ts`).
- **`proxy.ts`** — add `/account(.*)` to the protected matcher (Clerk).
- **`lib/email.ts`** — add `notifyKeyDecision` (approved/rejected); keep
  `notifyKeyRequest` (admin ping on new request).

## 3. Data model — extend `api_keys`

Add: `clerk_user_id text`, `status text NOT NULL DEFAULT 'pending'`
(`pending`|`approved`|`rejected`), `decided_at timestamptz`, `decided_by text`,
`reject_reason text`, `revealed_at timestamptz`. Make `key_hash` / `key_prefix`
**nullable** (no key until an approved user reveals one). `tier` retired (kept
nullable for back-compat, unused). One request row per Clerk user
(`clerk_user_id` unique among non-rejected rows; enforced in code).

Ships as: updated Drizzle schema (`lib/db/schema/api-keys.ts`), updated self-heal
DDL (`lib/db/ensure.ts`), and an idempotent ALTER run against the live Neon DB
(`scripts/db-setup.mjs`). Existing test-key rows are set `status='approved'`.

## 4. Key lifecycle (`lib/db/api-keys.ts`)

- `getRequestByClerkUser(userId)` → row | null.
- `createRequest({clerkUserId, name, email, intendedUse})` → insert `pending`;
  no key. No-op/refuse if the user already has a non-rejected row.
- `approveRequest(id, adminEmail)` / `rejectRequest(id, adminEmail, reason)` →
  set status + `decided_at`/`decided_by`(/`reject_reason`); send email.
- `revealOrRotateKey(userId, {rotate})` → only if `status='approved'`. Generates
  a key, stores hash+prefix, sets `revealed_at`, returns raw **once**. `rotate`
  replaces an existing key.
- `verifyApiKey(authHeader)` → requires matching `key_hash`, `status='approved'`,
  `revoked_at IS NULL`. Touches `last_used_at` best-effort.
- `listRequests()` for admin.

## 5. API behavior

`lib/api/authorize.ts` collapses to a single check: a valid **approved** key →
ok, else `401`. No tier param. All four endpoints (`stats`, `me`, `options`,
`breakdowns`) require an approved key. `/api/v1/me` reports the caller's status.
`tierSatisfies` / `Tier` removed from `lib/api-keys.ts`.

## 6. Validation & errors

- Request form: zod-validate `intended_use` (1–2000 chars). Name/email come from
  the Clerk session, not user input.
- Admin actions re-check `isAdminEmail` server-side before mutating.
- Emails are best-effort (never block the state change).

## 7. Testing

- Unit (Vitest): `generateApiKey`/`hashApiKey`/`parseBearer` (unchanged);
  request `intended_use` zod accept/reject. Pure logic only.
- Manual/integration: request → admin approve → reveal key → call an endpoint
  (200); reject path → rejected state + email; verify a non-approved key → 401.

## 8. Out of scope
Multiple keys per user, self-service profile edits, rate limiting, write/ingest.
