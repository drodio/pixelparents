## Progress Update as of June 29, 2026 — 10:51 PM Pacific

### Summary of changes since last update
First entry for `feat/dashboard-consolidate`. Consolidated everything into the
dashboard shell: (1) Developers is now an in-dashboard tab (no more new-tab jump
for signed-in users), and (2) signed-out visitors land IN the dashboard with the
nav tabs grayed/locked and a sign-in prompt, instead of being bounced to
`/sign-in`. The signed-out branches load and render ZERO DB/PII data, and
`/admin` + `/account` stay proxy-protected.

### Detail of changes made:
- `components/icons.tsx`: added `IconLock` (padlock) for the grayed nav items.
- `components/dashboard-shell.tsx`:
  - New `authed?: boolean` prop (default `true`). When `false`, the sidebar nav
    renders as grayed, non-interactive `<div>`s (opacity-reduced, `cursor-not-allowed`,
    `aria-disabled`, a small `IconLock` on md+) — tabs are visible but do nothing.
    The bottom account row is replaced by a prominent amber "Sign in" CTA plus a
    secondary "Create account" link, both → `/sign-in?redirect_url=/dashboard`.
    The Admin tab never appears in signed-out mode.
  - The "Developers" NAV item is no longer `external` (removed the `external`
    field from `NavItem` entirely); it now routes to the in-shell
    `/dashboard/developers`.
  - Active-tab logic now picks the single most-specific matching href (longest
    prefix) so `/dashboard/developers` highlights only "Developers", not also
    "Dashboard".
- `components/signed-out-panel.tsx` (new): shared centered "Sign in to access your
  {area}" panel with Sign in / Create account CTAs. Renders zero protected data.
- `app/(authed)/dashboard/page.tsx`, `app/(authed)/community/page.tsx`,
  `app/(authed)/family/page.tsx`: when `currentUser()` is null, RETURN EARLY
  (before any DB query) rendering `<DashboardShell authed={false} firstName={null}
  email={null} status={null}>` + `<SignedOutPanel area=... />`. No `redirect()`.
  Signed-in behavior is unchanged. Dashboard's Developers LinkCard dropped its
  `external` flag (now an in-shell link).
- `app/(authed)/dashboard/developers/page.tsx` (new): the in-dashboard developer
  hub. Reuses `KeyPanel` + `RequestForm` from `app/(authed)/account` (so the
  request path stays auth-gated via `submitRequest`'s `currentUser` check), shows
  the request → review → key flow keyed to the caller's Clerk user
  (`getRequestByClerkUser`), a short non-PII endpoint/docs summary, and a link to
  the full public `/developers` docs. Signed-out → grayed shell + locked prompt
  (no DB read).
- `proxy.ts`: removed `/family(.*)` from the protected-route matcher so it renders
  the grayed shell instead of bouncing. KEPT `/admin(.*)` and `/account(.*)`
  protected (sensitive: admin tools + API-key management). `/dashboard` and
  `/community` were already not in the matcher.
- Public `/developers` marketing/docs page is untouched (still open for unauth).

### Verification performed:
- `npm run typecheck`, `npm run lint`, `npm test` (218 passing), `npm run build`
  all green. Build emits both `/dashboard/developers` and `/developers` routes.
- Ran the worktree dev server and checked HTTP behavior:
  - `/dashboard`, `/family`, `/community`, `/dashboard/developers` → 200 (no
    redirect; render grayed shell).
  - `/account`, `/admin` → 307 → `/sign-in` (still protected).
  - `/developers` (public) → 200.
- Inspected the signed-out React Flight payloads: every page passes
  `DashboardShell { authed:false, firstName:null, email:null, status:null }` with
  the correct `SignedOutPanel` area ("dashboard" / "family" / "community"), 4
  `aria-disabled` locked tabs, Sign in / Create account CTAs, and ZERO PII/data
  markers (no MemberCard, ShowcaseClient, WorldMap, stats, names, or emails).

### Potential concerns to address:
- The in-dashboard developers tab lives at `/dashboard/developers` (not
  `/developers`) because the public marketing page already owns `/developers`
  outside the `(authed)` route group; two routes can't share one URL. The shell
  nav, dashboard LinkCard, and account page link were updated accordingly. If a
  future change wants `/developers` itself to be auth-aware, the public page would
  need to move into the `(authed)` group and branch on `currentUser()`.
- Signed-out pages still mount under the `(authed)` layout's `ClerkProvider`, so
  Clerk JS boots for unauth visitors on these routes (it did NOT before, since
  they redirected away). This is required for the in-shell sign-in CTAs to work
  and matches how `/sign-in` already behaves; acceptable but worth noting.
- The preview browser in this environment couldn't reach the local dev server
  (sandbox networking), so visual screenshots weren't captured — verification
  was done via HTTP status codes + server-rendered Flight payload inspection
  instead, which directly confirms props and absence of PII.
