# Branch: `admin-users-score-detail` — progress log

Branched from `main` (post PR #66).

## Progress Update as of 2026-05-26 6:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a per-row **Score Detail** link to the /admin/users table,
gated to the super-admin (drodio) only. It opens the existing
ScoreDetail debug view (raw scores, breakdowns, recommendations,
stored profile JSON, citation URLs, raw Exa grounding + the
copy-to-markdown report) for the scored profile.

### Design
- New `isSuperAdmin()` in `src/lib/admin.ts` — STRICT subset of admins
  from `SUPERADMIN_EMAILS` (defaults to `drodio@storytell.ai` so the
  gate is closed even before the env var is set). Same verified-email
  rule as isAdmin().
- The ScoreDetail view already exists as `ScoreDetailButton` on the
  profile page, but was gated to localhost only (dev). Rather than
  duplicate its heavy data plumbing into the 200-row table, the table
  link points super-admins to `/profile?e=<id>&debug=1`:
  - profile page now shows the button when `isLocalhost || isSuperAdmin`,
  - and `?debug=1` auto-opens the modal (new `autoOpen` prop on
    ScoreDetailButton).
  This keeps the table light (no per-row grounding JSON) and reuses
  the existing, complete debug component.

### Files
- `src/lib/admin.ts` — `isSuperAdmin()` + `superAdminEmails()`.
- `src/components/ScoreDetailButton.tsx` — `autoOpen?: boolean` prop.
- `src/app/(authed)/profile/page.tsx` — gate = localhost OR superAdmin;
  `?debug=1` → autoOpen; `debug` added to searchParams type.
- `src/app/(authed)/admin/users/page.tsx` — super-admin-only "Detail"
  column linking to `/profile?e=<id>&debug=1` (new tab).

### Verified
- `pnpm tsc --noEmit` clean.
- /admin/users → 307 (gate) unauth; /profile?...&debug=1 → 200.

### Note
- Set `SUPERADMIN_EMAILS` in prod/Vercel if more than drodio should
  see Score Detail; otherwise the default keeps it drodio-only.
