// Generates the Markdown contract for the Super-Admin API — the reference the
// Phase-2 native app (and any agent building against it) consumes. Pure.
export function buildAdminApiGuide(opts: { baseUrl: string }): string {
  const base = opts.baseUrl.replace(/\/+$/, "");
  return `# Founder Festival — Super-Admin API

This is the **super-admin-only** API behind the native app. A super admin can call
**every** Founder Festival endpoint through it. It is identity-based and short-lived
by design — there is no long-lived API key to leak.

## Authentication — Clerk session token (bearer)

The app signs the user in with Clerk's Expo / React Native SDK, then sends the Clerk
**session token** on every request:

\`\`\`
Authorization: Bearer <clerk_session_token>
\`\`\`

Get the token in the app with Clerk's \`getToken()\` (it auto-refreshes; tokens live
~60s). The backend's \`clerkMiddleware\` resolves the bearer token to the signed-in
Clerk identity — exactly as it resolves the web cookie — so \`auth()\` /
\`currentUser()\` and every existing authorization gate work unchanged.

**Why this is secure**
- No long-lived secret on the device — only a ~60s auto-refreshing token.
- Authorization is your verified Clerk email against the hardcoded super-admin list
  (changing it needs a code change + PR).
- A lost device's Clerk session is revocable instantly from the Clerk dashboard.
- **MFA is required** on super-admin accounts — enforce it in the Clerk dashboard
  (Organization/User settings → require 2FA). This is an operational must, not
  optional.
- Every call — allowed or denied — is written to an append-only audit log.

## Start here

\`\`\`
GET ${base}/api/admin/me
Authorization: Bearer <token>
\`\`\`
- **200** \`{ super_admin: true, user_id, email, name, token_type }\` — you're a super admin.
- **401** \`{ error: "unauthenticated" }\` — no/invalid token.
- **403** \`{ error: "forbidden" }\` — signed in but not a super admin.

Call this right after sign-in to gate the app's UI.

## Audit trail

\`\`\`
GET ${base}/api/admin/audit?limit=50&before=<ISO timestamp>
Authorization: Bearer <token>
\`\`\`
Returns \`{ results: [...], next_cursor }\`, newest first. Each row:
\`{ id, clerk_user_id, email, method, path, status, token_type, ip, user_agent, meta, created_at }\`.
Page with \`before = next_cursor\`. Every super-admin API call (and every denied
attempt) is recorded; the three destructive actions (profile delete, profile hide,
admin-access revoke) are always logged with action metadata.

## Calling every other endpoint

Because the bearer token resolves to your super-admin identity, **the entire backend
is available** with the same \`Authorization: Bearer <token>\` header — no separate
admin mirror of each route. The surface (auth shown is what a super admin satisfies):

### Admin (cross-user) — \`/api/admin/*\`
- Access & roles: \`GET/POST/PATCH/DELETE /api/admin/access[...]\`,
  \`/api/admin/roles[...]\`, \`/api/admin/invites[...]\`, \`/api/admin/clerk-users\`.
- Profiles: \`/api/admin/profiles/list\`, \`/api/admin/profiles/find-email[...]\`,
  \`POST /api/admin/profile/{evalId}/hide\`, \`POST /api/admin/profile/{evalId}/delete\`,
  \`GET /api/admin/profile/{evalId}/scoring-runs\`.
- Scoring jobs: \`/api/admin/jobs\`, \`/api/admin/jobs/{id}[...]\`,
  \`/api/admin/rescore-all\`.
- Events/hosts/sponsors: \`/api/admin/events[...]\`, \`/api/admin/hosts[...]\`,
  \`/api/admin/sponsors[...]\`.
- Credits: \`POST /api/admin/credits/checkout\`.

### Per-user (acts on the caller's own identity) — e.g.
- \`/api/account/*\`, \`/api/recommendations\`, \`/api/badges\`, \`/api/score-items\`,
  \`/api/rescore\`, \`/api/developers/*\`.

### Public reads also available with the token
- The \`/api/v1/*\` surface (score, leaderboard, search, events, industries) — though
  those also accept a developer API key.

## Errors
JSON \`{ "error": "<code>" }\` with status: 401 unauthenticated · 403 forbidden ·
429 rate_limit · 4xx/5xx per the underlying endpoint.

## Rate limiting
Super-admin API calls are capped per user per day (generous; abuse backstop only).
A 429 returns \`{ error: "rate_limit", limit, resetsAt }\`.

## Notes for the app
- Always send the bearer token; never store a long-lived secret.
- Treat 401 as "re-authenticate", 403 as "not a super admin — sign out".
- Surface the audit feed in-app so actions are reviewable.
`;
}
