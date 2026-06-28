# PRD — sponsor-host-profile-search

## Progress Update as of 2026-06-06 6:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
For UNCLAIMED recap viewers (anonymous or signed-in-without-a-profile), the Luma description
AND the public learnings now clamp to ~10 lines, fade to the page bg, and show a "Claim your
profile to read more" CTA → "/" (the same no-profile fallback the Events nav uses). Claimed
viewers see full content.

### Detail of changes made:
- `src/components/events/ClaimFadeGate.tsx` (new, client): clamps children to 256px, measures
  overflow via ResizeObserver, and only shows the gradient fade + CTA when content actually
  overflows (short blurbs render normally; no pre-measure flash via a "pending" state).
- Recap (`events/[slug]/page.tsx`): `unclaimed = !viewer.evaluationId`; wraps the description
  article and the learnings body in `ClaimFadeGate` when unclaimed.
- Verified: SSR includes the clamp wrapper for anon; tsc clean; recap 200. The fade+CTA is
  client-measured so it needs a browser to see (not visible via curl) — eyeball in prod.

## Progress Update as of 2026-06-06 6:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the "View on Luma ↗" link from the bottom of the public event recap (per DROdio).
tsc clean; recap still 200.

## Progress Update as of 2026-06-06 6:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Replaced the sponsor "attach person by LinkedIn URL" field with the SAME search
used on the header/leaderboard, and added the previously-missing "People at this host" feature
using that same search. Selecting a result attaches by evaluation id; when no one matches, the
"Score them now" affordance opens the homepage scoring flow in a NEW TAB (per DROdio). No
schema/migration — `host_profiles` + `sponsor_profiles` already exist on main.

### Detail of changes made:
- `src/components/admin/AdminProfilePicker.tsx` (new): reuses `/api/leaderboard/search`
  (same debounce/markup as `HeaderSearch`), `Avatar` + `displayName`; `onAttach(PickerResult)`
  on click; empty state uses `scoreThemHref()` with `target="_blank"`. `excludeIds` greys out
  already-attached people.
- Sponsors: `attachSponsorProfileById` in `src/lib/sponsors.ts`; the profiles POST route now
  takes `{evaluationId}` (legacy `{linkedinUrl}` still works); `SponsorEditor` uses the picker.
- Hosts (net-new people UI): `HostProfile` type + `getHostProfiles`/`attachHostProfileById`/
  `detachHostProfile` in `src/lib/hosts.ts`; `POST/DELETE /api/admin/hosts/[id]/profiles`;
  `HostEditor` "People at this host" section; host detail page passes `initialProfiles`; public
  recap renders host people as chips under each host (mirrors sponsor people).
- Test: `tests/app/profile-attach-by-id.test.ts` (host + sponsor attach/detach by id, idempotent).
  tsc clean; admin pages + recap render 200 on dev; search API 200.

### Potential concerns to address:
- Picker UI couldn't be click-verified headlessly (admin auth) — logic is reused from the
  proven HeaderSearch + covered by the lib test. Worth an eyeball in prod after deploy.
- "Score them now" is a navigate-away-in-new-tab flow (no inline create-and-return) — by design,
  matching the existing search's add-new affordance.
