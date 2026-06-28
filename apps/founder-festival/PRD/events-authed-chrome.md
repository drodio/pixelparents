# PRD — events-authed-chrome

## Progress Update as of 2026-06-08 04:39 PM Pacific
*(Most recent updates at top)*

### Summary
Made /events consistent with /profile and /leaderboard: moved the public events
routes into the (authed) route group so they inherit the shared chrome
(ClerkProvider + the fixed top-right "Admin" link + UserBadge auth/login icon +
MembershipBanner). URLs are unchanged (route group, no path segment).

### Detail
- Moved `src/app/events/*` → `src/app/(authed)/events/*` (page.tsx, [slug]/page.tsx,
  [slug]/apply/page.tsx, error.tsx, loading.tsx). /events, /events/[slug],
  /events/[slug]/apply still resolve.
- Now all three pages have: logo + SiteHeaderNav top-left (each page's own
  header) + Admin + UserBadge top-right (the (authed) layout). /leaderboard +
  /profile already had the chrome; this brings /events in line.
- Note: events pages now load Clerk JS (needed for the auth icon) — acceptable
  per the explicit request.

### Verification
- `next build` green; /events routes still registered; dev /events now renders
  the Clerk chrome (data-clerk present).
