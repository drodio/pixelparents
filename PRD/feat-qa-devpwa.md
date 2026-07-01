## Progress Update as of [June 30, 2026 — 9:55 PM Pacific]

### Summary of changes since last update
First entry on this branch. Fixed the verified QA findings for the Developers /
API / Sign-in-apps surface (from the devpwa QA pass). Four of five findings fixed
within the owned file set; the fifth is out of the owned scope and is left for the
owner of that route. tsc + eslint clean, all 793 vitest tests pass.

### Detail of changes made:
- **Finding 1 (MEDIUM) — minor-data Sign-in apps went live with no admin alert.**
  `registerOAuthApp` (app/(authed)/dashboard/developers/oauth-actions.ts) now sends
  an admin notification after a successful register, via a new best-effort notifier
  `lib/oauth/notify.ts` (`notifyAdminNewOAuthApp`). The notifier mirrors the
  env-driven Resend pattern used by lib/email.ts (RESEND_API_KEY / RESEND_FROM /
  NOTIFY_TO), never hardcodes contact info (PUBLIC repo), and swallows all errors so
  registration is never blocked. Minor-data apps (requestsMinorData(scopes)) get a
  louder "Review needed" subject and a link to /admin/oauth-apps. The panel copy
  (oauth-apps-panel.tsx) that promised "extra review" was reworded to match what
  actually happens: minor-data apps are flagged to an admin who can revoke access at
  any time. NOTE: I deliberately did NOT change lib/oauth/gating.ts to hard-block the
  owner_api_approved auto-live path for minor-data apps — the enforcement points that
  read gating (app/oauth/authorize/page.tsx, app/api/oauth/token/route.ts) are OUTSIDE
  the owned file set, and gating them there without touching those would make the UI
  and the enforcement disagree. The admin-alert + honest-copy path resolves the
  contradiction within scope; a follow-up can tighten gating cross-cuttingly.
- **Finding 2 (MEDIUM) — "Request API access" CTA landed users at the wrong page.**
  Both CTAs on app/developers/page.tsx now point to
  `/sign-in?redirect_url=/dashboard/developers` (the dedicated dev hub that leads with
  "Your API access" + RequestForm) instead of `/account`. The sign-in page already
  allows any relative redirect, so no other change was needed.
- **Finding 3 (MEDIUM) — Claude Desktop MCP config in the docs was invalid.**
  app/developers/page.tsx: replaced the remote-shape `{ url, headers }` block (which
  Claude Desktop's stdio-only config ignores) with a valid `mcp-remote` stdio bridge
  (`npx -y mcp-remote <url> --header "Authorization: Bearer YOUR_KEY"`). The plain
  https://pixelparents.org/api/mcp URL is kept, now labeled for remote MCP clients
  (Claude.ai custom connectors); each block is labeled for the client it works in.
- **Finding 4 (LOW) — register-app reveal couldn't be dismissed / didn't confirm config.**
  RegisterState.reveal now carries the saved redirectUris + scopes; the reveal card in
  oauth-apps-panel.tsx echoes them back so the developer can confirm what was stored
  (e.g. a typo'd redirect URI dropped by validation), and a "Register another app"
  button remounts a fresh form (via a key bump) to clear the one-shot reveal without a
  full page reload.
- **Finding 5 (LOW) — consent screen shows raw email as display name.** SKIPPED as
  out of scope: the fix target is app/oauth/authorize/page.tsx:99, which is not in the
  owned file set (app/(authed)/developers/**, lib/oauth/**, app/api/oauth/**, plus the
  PWA/OG/layout files). Adding an emailLocalPart helper to lib/oauth without being able
  to wire it into the authorize page would be dead code, so nothing was changed.

### Potential concerns to address:
- The trust-model tightening for minor-data apps (option 1 in Finding 1 — make
  minor-data apps ALWAYS require explicit per-app admin approval) still needs a
  cross-cutting change to lib/oauth/gating.ts + the two enforcement callers
  (authorize page + token route). That spans files outside this task's ownership.
- Finding 5's display-name polish is unaddressed and lives in app/oauth/authorize.
- `next build` was NOT run in the worktree (per instructions). The OG/metadata routes
  were not modified here, but they already follow the config-as-literals convention
  from prior commits (#160/#161). tsc + lint + tests are green.
