# Secure Super-Admin API foundation

**Date:** 2026-06-06
**Branch:** `super-admin-api`
**Status:** Designed autonomously (owner away overnight, delegated full build); built per this spec.

## Goal

Make every Founder Festival backend endpoint callable by a **super admin** from a
future native mobile app, **securely**, without rebuilding the 77 existing routes.
This is **Phase 1** (the secure backend foundation). The native app is Phase 2.

## Key architectural insight

Every internal endpoint already authorizes by **identity**: `isSuperAdmin()`
(src/lib/admin.ts) checks the caller's verified Clerk email against a hardcoded
list; admin/grant gates resolve the same way. Authentication is via Clerk.

The installed `@clerk/nextjs` v7.3.7 `clerkMiddleware` already calls
`authenticateRequest` with `acceptsToken: "any"`, so it **already resolves a Clerk
session token sent as `Authorization: Bearer <token>`** into `auth()` /
`currentUser()` — not just cookies. Therefore a native app that signs the super
admin in via Clerk's Expo SDK and sends `getToken()` as a bearer header is
**already** authenticated as that super-admin identity on every endpoint, with each
endpoint's existing authorization intact.

**Consequence:** "every endpoint available as a super-admin API" needs no new route
per endpoint. The work is the **secure guard + audit trail + documented contract**.

## Why this is "super secure"

- **Short-lived tokens.** Clerk session tokens (~60s) auto-refresh via the Expo SDK.
  No long-lived secret ever sits on the device (unlike a static API key).
- **Identity, not a shared secret.** A super admin is the hardcoded
  `SUPER_ADMIN_EMAILS` set; changing it requires a code change + PR (deliberate
  friction). The API inherits exactly this.
- **Revocable instantly.** A lost device's Clerk session is revoked from the Clerk
  dashboard; the token dies within the refresh window.
- **MFA-enforceable.** Clerk can require 2FA on these accounts (dashboard setting —
  documented as a required operational step).
- **Audit trail.** Every super-admin API call (and every denied attempt) is logged.
- **No posture change.** Bearer-token resolution is existing Clerk behavior; this
  spec only *adds* a guard, an audit log, and docs. Existing cookie auth is untouched.

## What we build

### 1. Migration: `admin_audit_log` (append-only)
Columns: `id` (uuid pk), `clerk_user_id` (text), `email` (text, nullable),
`method` (text), `path` (text), `status` (int), `token_type` (text: `bearer` |
`cookie` | `unknown`), `ip` (text, nullable), `user_agent` (text, nullable),
`meta` (jsonb, default `{}`), `created_at` (timestamptz default now).
Index on `(clerk_user_id, created_at desc)` and `(created_at desc)`.

### 2. `src/lib/admin-api.ts` — the hardened entry point
- `tokenTypeOf(req)` — `bearer` if an `Authorization` header is present, else `cookie`.
- `logAdminAction({ clerkUserId, email, method, path, status, tokenType, ip, userAgent, meta })`
  — **best-effort** append to `admin_audit_log`; swallows errors (fail-open, so the
  API works even if the table is absent — same pattern as `verifyApiKey`'s
  `last_used_at` touch).
- `requireSuperAdminApi(req)` — resolves `auth()` (cookie or bearer), then:
  - no `userId` → returns a 401 `NextResponse` (`{ error: "unauthenticated" }`);
  - rate-limit per user (reuse `checkAndIncrementRateLimit`, generous cap) → 429;
  - `!isSuperAdmin()` → audit the **denied** attempt, return 403
    (`{ error: "forbidden" }`);
  - else → `{ userId, email, ip, userAgent, tokenType }` for the handler to use.
  Returns a discriminated union so callers do `if (gate instanceof NextResponse) return gate;`.

### 3. New thin admin-API endpoints
- `GET /api/admin/me` — whoami; the app's gate. Returns
  `{ super_admin: true, user_id, email, name }`. Audits the call.
- `GET /api/admin/audit?limit=&cursor=` — super-admin reads the recent audit log
  (newest first, keyset by created_at+id). Demonstrates + monitors the trail.

### 4. Audit on the destructive super-admin endpoints
Add a best-effort `logAdminAction` to the three irreversible super-admin routes
(profile **delete**, profile **hide**, admin-access **revoke**) — additive single
calls after the existing checks succeed. High value, low blast radius.

### 5. Documented contract (for the Phase-2 app)
`docs/super-admin-api.md` + a pure `buildAdminApiGuide()` (mirrors
`agent-guide.ts`): how to authenticate (Clerk Expo `getToken()` → bearer), the
super-admin guarantee, the full endpoint inventory with methods/auth, the audit
behavior, error shapes, and the MFA operational requirement.

### 6. Tests
- `requireSuperAdminApi`: super-admin → ok; authenticated non-super-admin → 403;
  unauthenticated → 401 (mock `auth`/`isSuperAdmin`).
- `logAdminAction`: never throws when the DB write fails (fail-open).
- `tokenTypeOf`: header present → bearer; absent → cookie.
- `/api/admin/me` route test mirroring the existing admin route tests.
- `buildAdminApiGuide`: documents the endpoints + bearer auth + super-admin note.

## Out of scope (Phase 2+)
- The native app (Expo) itself.
- Adding audit to all 77 endpoints (only the 3 destructive ones now; the guard
  makes the rest a fast follow).
- Per-endpoint scoping/least-privilege tokens (super admins get full access by
  design, per the request).
- CORS for browser cross-origin clients (native apps aren't CORS-bound).

## Deploy & DB
Additive migration (new table only — no change to existing tables) + additive code.
Audit logging is **fail-open**, so prod is safe regardless of migration timing.
Apply the migration to the prod Neon branch via the Neon CLI (low-risk `CREATE
TABLE`), then deploy per the `deploy-every-time` default.

## Risks / watch-items
- `currentUser()` under a bearer-token request: resolves via the authenticated
  `userId`; validated by tests + the `/api/admin/me` smoke test. The final
  real-device token round-trip is a Phase-2 validation (needs the app or a live
  Clerk login — can't be fully exercised autonomously).
- MFA enforcement is a Clerk dashboard action, not code — flagged for the owner.
- Rate-limit cap chosen generously so a legitimate admin session isn't throttled.
