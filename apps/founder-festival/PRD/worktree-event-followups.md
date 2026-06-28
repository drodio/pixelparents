# PRD — worktree-event-followups

## Progress Update as of 2026-06-05 4:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Another catch-up merge with main (it's churning from other worktree sessions). Notable: main's
security P0 (#202) added an email-HTML-escaping policy — fixed `sendConnectionRequestEmail` to
`escapeHtml(fromName)` (a user-supplied profile name; was an injection vector). Took main's
drizzle/ + rubric wholesale and re-added my one rubric line; event migration renumbers again.

### Detail of changes made:
- `src/lib/email.ts`: added `escapeHtml` + escaped `fromName`/`eventTitle` in the connection email.
- Resolved perpetual drizzle-journal + rubric conflicts by taking main's versions + regenerating.

### Potential concerns to address:
- Landing the merge is a race vs. main's velocity; merge PR #195 immediately after this push.

## Progress Update as of 2026-06-05 4:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
DEPLOY: applied the event migration to **prod** (12/12 tables + learnings cols live on
ep-fragrant-surf via `node /tmp/apply-prod.cjs`). Confirmed prod already has RESEND_API_KEY +
LUMA_API_KEY; only BLOB_READ_WRITE_TOKEN missing (Blob store not provisioned — uploads 503
until added; deferred, optional). Caught the branch up to main again (9 commits incl #198
canonical_industries which added its own 0036) — my event migration renumbers to 0037.

### Detail of changes made:
- Prod migration applied (additive; tables already existed nowhere else). Migration file
  renumbered locally to 0037_* after this merge — **prod already has the tables, no re-apply
  needed.**
- Resolved scoring-rubric changelog (kept all entries) + drizzle journal (reset to main, regen).

### Potential concerns to address:
- main is moving fast; merge PR #195 ASAP after this push. main's own pending migrations
  (0035 investor_status, 0036 canonical_industries) are DROdio's to apply to prod — my code
  doesn't depend on them.
- Blob store still needed for uploads: `vercel blob create-store founder-festival-events`.

## Progress Update as of 2026-06-05 4:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Deploy prep, Step 1: caught the branch up to the latest origin/main (5 new commits — founder/
investor status markers). main shipped its own 0035 migration, so my 5 event migrations
(0035–0039) were dropped and regenerated as ONE consolidated migration on top of main's
0035_panoramic_charles_xavier. Resolved the scoring-rubric changelog conflict (kept all entries).

### Detail of changes made:
- Merged origin/main@36aebc6; schema.ts auto-merged (main's investorStatus + my event tables).
- drizzle/ reset to main; the consolidated event migration is the new highest-numbered file.
- **Prod migration is now a SINGLE file: `drizzle/0036_dashing_tattoo.sql`** (was 0035–0039) —
  12 event tables + the two `events.learnings_*` columns. Apply just this one file to prod.

### Potential concerns to address:
- After this merge: re-run tsc + event tests, push, update PR #195 body (migration is now one file).

## Progress Update as of 2026-06-05 4:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 6c: connection-request emails + tokenized approve/deny. When a request is genuinely
pending, the target gets an email (best-effort) with Approve/Deny links that land on a
confirmation page (explicit Confirm — no one-click GET, so email scanners can't auto-decide)
plus a "manage who can connect with you" link to the event. **Phase 6 (and all 6 phases) done.**

### Detail of changes made:
- `src/lib/email.ts`: `sendConnectionRequestEmail` (approve/deny/manage links).
- Public confirm page `/connect/respond` + `ConnectionRespond` client component +
  `POST /api/connections/respond` (decides via single-use token; idempotent).
- Connect route wires the email best-effort on pending (swallows failures; uses request origin
  for links). Auto-approved/denied requests send no email.
- Test: token decide path (single-use). tsc clean; confirm page renders.

### Deferred (documented, not blocking):
- Global consent panel on the /profile page — already reachable from every event's Attendee hub
  ("Auto-handle requests everywhere", scope=global); skipped the second surface to avoid
  destabilizing the large profile page autonomously.
- Granular one-click bulk-consent BUTTONS inside the email (per group × scope) — the email links
  to the full consent panel instead; tokenized one-click for 12 combos is extra security surface
  to add under review.

### Before relying on email in prod
- Verify `RESEND_API_KEY`/`RESEND_FROM` and eyeball the email template. The in-app loop works
  without email; email is a best-effort enhancement.

## Progress Update as of 2026-06-05 3:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 6b: the full in-app attendee connection experience. On the recap, a gated attendee now
sees an "Attendee hub": a directory of fellow attendees, a Connect button per person, an
incoming-requests inbox (approve/deny), a per-event contact-sharing toggle (open-to-all vs
by-request), and consent preferences (founder/investor/sponsor × this-event + global).

### Detail of changes made:
- `src/lib/attendee-connections.ts`: pure `resolveAutoAction` (event overrides global);
  `requesterGroup` (sponsor-of-event else role); `createConnectionRequest` (auto-approve/deny
  short-circuit via prefs, else pending); `decideConnectionRequest` (+ by-token variant for
  future email); `getEventDirectory` (role, connection state, contact revealed when open-to-all
  OR approved); prefs + contact-sharing getters/setters; `listIncomingRequests`.
- Routes: `/api/events/[slug]/connect`, `/api/events/[slug]/contact-sharing`,
  `/api/connections/decide`, `/api/connections/preferences` (all auth + attendee-gated).
- UI: `AttendeeDirectory`, `ConnectionInbox`, `ConnectionPrefsPanel`, `ContactSharingToggle`,
  composed into an `AttendeeHub` on the recap (gated by isAttendee).
- Tests: pure `resolveAutoAction` (5) + integration (auto-approve, contact reveal, open-to-all,
  manual decide, non-target rejection). All pass.

### Potential concerns to address:
- **Phase 6c remaining (email):** outbound connection-request emails + tokenized one-click
  approve/deny links + the global consent panel on the /profile page. The in-app loop is
  complete and works for signed-in users; `decideConnectionRequestByToken` already exists.
  Email is intentionally NOT auto-wired yet — sending to real attendees is an outward-facing
  action to enable under your review (and needs RESEND verified).
- Attendee-hub UI verified to compile + SSR + pass logic tests; the signed-in attendee view
  needs a real Clerk session matched to an approved attendee to eyeball visually.

## Progress Update as of 2026-06-05 3:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 6a (foundation): all Phase 6 tables + the attendee gate + attendee-only content on the
recap. Signed-in viewers whose claimed profile RSVP'd "approved" now see attendee-only photos
and attendee-only learnings; everyone else sees only public content.

### Detail of changes made:
- Schema: `connection_requests`, `connection_preferences`, `event_contact_sharing`.
  Migration `0039_rainy_slayback.sql` (applied to dev).
- `src/lib/attendee.ts`: `getViewerEvaluationId`, `isEventAttendee` (approved + matched),
  `getViewerAttendeeContext`. Works on the public recap because Clerk middleware (src/proxy.ts)
  covers all routes — server `auth()` resolves the session even with no Clerk JS mounted.
- Recap page: attendee-gated photos (visibility=attendees) + an "Attendees only" learnings card.
- Test: `attendee-gate.test.ts` (approved→true; pending/unmatched/anon→false).

### Potential concerns to address:
- Remaining Phase 6 (next commits): attendee directory + Connect requests + consent preferences
  (founder/investor/sponsor × event/global) + per-event contact-sharing mode + email notifications.
- Email + tokenized approve/deny links are outbound/security-sensitive — will build the in-app
  approve/deny loop first (works for signed-in targets) and treat email as a flagged add-on.

## Progress Update as of 2026-06-05 3:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 5 (event priorities) done + verified. Admins can define categorized priorities per
event (same taxonomy as founder priorities) on the Recap page, stored for future founder-
matching. Pushed Phase 4 (PR #195 updated).

### Detail of changes made:
- Schema: `event_priorities` (eventId, text, category, sortOrder). Migration `0038_moaning_tarot.sql`.
- `src/lib/event-priorities.ts`: `PRIORITY_CATEGORIES` (fundraising/hiring/intros/tactical/
  positioning/wellbeing), colors, `getEventPriorities`, `setEventPriorities` (replace, order-
  preserving, coerces unknown categories → tactical, drops blanks).
- Route: `/api/admin/events/[id]/priorities` (GET/POST replace).
- `EventPrioritiesEditor` on the Recap page (add by text+category, list, remove, save).
- Test: replace semantics + category coercion + blank-drop.

### Potential concerns to address:
- The founder↔event priority MATCHING engine is intentionally out of scope (spec §8).
- Only Phase 6 (attendee experience) remains — the largest phase.

## Progress Update as of 2026-06-05 3:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 4 (sponsors) done + verified. Sponsors are reusable entities (name/blurb/logo/website)
with many-to-many event links and attached festival profiles. Admin CRUD + per-event
assignment + profile attach-by-LinkedIn; public recap shows a Sponsors section with logos and
the people who work there (linking to their profile pages). Pushed Phase 3 (PR #195 updated).

### Detail of changes made:
- Schema: `sponsors`, `event_sponsors` (m2m), `sponsor_profiles` (m2m). Migration
  `0037_luxuriant_jocasta.sql` (applied to dev).
- `src/lib/sponsors.ts`: CRUD, getSponsorsForEvent/setEventSponsors, attach/detach profiles
  by LinkedIn URL (case/trailing-slash-insensitive match), `profileHref` for public links.
- Routes: `/api/admin/sponsors` (GET/POST), `/api/admin/sponsors/[id]` (PATCH/DELETE),
  `/api/admin/sponsors/[id]/logo` (Blob), `/api/admin/sponsors/[id]/profiles` (POST/DELETE),
  `/api/admin/events/[id]/sponsors` (POST set).
- Admin UI: `/admin/sponsors` (SponsorsManager), `/admin/sponsors/[id]` (SponsorEditor with
  logo upload + profile attach), sponsor picker on the Recap page, "Sponsors" link on /admin/events.
- Public recap: Sponsors section (logo + blurb + website link) with attached people as chips
  linking to their /profile pages.
- Test: `tests/app/sponsors.test.ts` (associations + attach/detach by LinkedIn).

### Potential concerns to address:
- Sponsor profile attach matches by exact LinkedIn URL (normalized) — no fuzzy/name search yet.
- Remaining: Phase 5 (event priorities), Phase 6 (attendee experience).

## Progress Update as of 2026-06-05 2:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 3 (hosts) done + verified. Hosts are reusable entities (name/blurb/icon/URL) with
many-to-many event links and cross-event aggregate stats. Admin CRUD + per-event assignment;
public recap shows a "Hosted by" strip. Seeded District (Jun1&3) + Agate Hound (Jun2) on dev.

### Detail of changes made:
- Schema: `hosts`, `event_hosts` (m2m), `host_profiles` (m2m, UI later). Migration
  `0036_rare_mantis.sql` (applied to dev).
- `src/lib/hosts.ts`: CRUD, `getHostsForEvent`, `setEventHosts`, `getHostStats` (avg
  founder/investor scores across all the host's events' approved+matched attendees).
- Routes: `/api/admin/hosts` (GET/POST), `/api/admin/hosts/[id]` (PATCH/DELETE),
  `/api/admin/hosts/[id]/icon` (Blob upload), `/api/admin/events/[id]/hosts` (POST set).
- Admin UI: `/admin/hosts` (list+create via HostsManager), `/admin/hosts/[id]` (HostEditor +
  aggregate stats), host picker on the event Recap page. "Hosts" link on /admin/events.
- Public recap: "Hosted by" strip (icon + blurb, click-out to host URL).
- `scripts/seed-event-hosts.ts`: idempotent, maps District/Agate Hound by stable Luma
  event ids — safe to run on prod after Luma sync.
- Test: `tests/app/hosts.test.ts` (associations + aggregate stats + idempotent replace).

### Potential concerns to address:
- `host_profiles` table exists but has no UI yet (deferred per spec).
- Prod: create hosts via admin UI, or run `scripts/seed-event-hosts.ts` after Luma sync.

## Progress Update as of 2026-06-05 2:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 2 (public analytics) done + verified. Recap page now shows aggregate stats (total
attendees, founder/investor counts, ratio, avg founder/investor scores) and two averaged
composition spider graphs. Pushed Phases 0+1 and opened draft PR #195.

### Detail of changes made:
- `src/lib/event-analytics.ts`: pure `classifyRole` + `computeCohortStats` (4 tests).
- `src/lib/credibility.ts`: `getAveragedRadars(founderBreakdowns, investorBreakdowns)` —
  averages each cohort's raw per-axis points, percentile-ranks vs the population cache.
- `src/lib/events.ts`: `getEventAnalytics(eventId)` — approved attendees, matched+scored
  cohort split by role, returns stats + averaged radars (null when no scored matches).
- `src/components/events/EventAnalyticsSection.tsx` + wired into the recap page.
- Tests: `event-analytics` (pure, 4) + `event-analytics.test.ts` (integration, 2). All pass.
- Verified rendering by temporarily seeding 2 matched attendees on a June event → "By the
  numbers" + both radars rendered at HTTP 200 → cleaned up the seed.
- Draft PR: https://github.com/drodio/founder-festival/pull/195

### Potential concerns to address:
- Averaged radars show empty drill-down evidence (aggregate has no single source) — by design.
- Analytics only count approved + matched + non-low-signal profiles (per spec assumptions).

## Progress Update as of 2026-06-05 1:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged current origin/main (~30 commits: founder-status, leaderboard tweaks, HN deep-links,
mobile audit, etc.) into the branch to resolve the base divergence + migration-number
collision while the branch is still small. schema.ts auto-merged cleanly (founder_status +
my event tables coexist). Reset drizzle/ to main's state and will regenerate ONE migration
numbered after main's 0034.

### Detail of changes made:
- Merge commit brings the branch up to origin/main@3c7f286. (origin/main has since moved to
  8ad5c04 — main is very active today; a final catch-up merge may be needed at PR time.)
- Dropped my collision-numbered migrations (0033_wakeful, 0034_unusual); drizzle/ now matches
  main (…0033_chunky_norrin_radd, 0034_fluffy_tony_stark). Next: db:generate → 0035.
- Backup of pre-merge state: branch `backup/event-followups-preRebase-ec3147b`.

### Potential concerns to address:
- Must regenerate + apply the new event migration (0035) after this merge; verify tsc + tests.
- main is advancing fast; expect to re-merge once more before final PR.

## Progress Update as of 2026-06-05 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 1 write-side: admin photo upload (Vercel Blob) + TipTap rich-text learnings editor.
New admin "Recap & content" page. tsc clean; all routes return 200 on :3003 (TipTap SSR-safe).

### Detail of changes made:
- Deps: `@vercel/blob`, `@tiptap/react@3`, `@tiptap/starter-kit@3` (React 19-compatible).
- `src/components/admin/RichTextEditor.tsx` (TipTap, immediatelyRender:false, toolbar).
- `EventLearningsEditor` + `EventPhotoManager` client components.
- Routes: `POST /api/admin/events/[id]/learnings`; `GET/POST /api/admin/events/[id]/photos`;
  `PATCH/DELETE /api/admin/events/[id]/photos/[photoId]`. All gated by `manage_events`.
  Upload returns 503 with a clear message when BLOB_READ_WRITE_TOKEN is unset.
- `src/app/(authed)/admin/events/[id]/recap/page.tsx` + link from the event detail header.

### Potential concerns to address:
- **Branch base divergence (IMPORTANT):** this branch was cut from origin/main@5ab4446;
  origin/main advanced ~30 commits during the session (now 3c7f286) and merged its own
  0033/0034 migrations. Merging main in next; will regenerate ONE migration numbered after
  main's 0034. Pre-existing `tests/lib/eval-pipeline.test.ts` failures (2) are in untouched
  scoring code (rubric drift, expects 30 / gets 67) — not caused by this work.
- Photo upload needs BLOB_READ_WRITE_TOKEN in env to actually store files.

## Progress Update as of 2026-06-05 1:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 1 read-side done + verified. Added `event_photos` table + `learnings_public`/
`learnings_attendees` columns (migration 0034, applied to dev). Built the public `/events`
index (past to all + upcoming section) and turned `/events/[slug]` into apply-vs-recap based
on whether the event is past. Recap renders a photo carousel (Luma cover + public photos) +
public learnings + Luma link. All verified rendering on :3003 against the real June events.

### Detail of changes made:
- Schema: `eventPhotos` (blobUrl, source, visibility public/attendees, sortOrder, uploadedBy),
  `events.learningsPublic`/`learningsAttendees`. Migration `0034_unusual_texas_twister.sql`.
- `src/lib/event-recap.ts`: pure `isPastEvent`, `visiblePhotos`, `sanitizeRecapHtml` (7 tests).
- `src/lib/events.ts`: `listPastEvents`, `listUpcomingEvents`, `getEventPhotos`.
- `src/components/events/PhotoCarousel.tsx`: dependency-free client carousel.
- `src/app/events/page.tsx` (new public index) + reworked `src/app/events/[slug]/page.tsx`.
- **Removed** `src/app/(authed)/events/page.tsx` — it was a "coming soon" placeholder that
  bounced anonymous users to "/", conflicting with "past events show to everyone". The public
  `/events` now owns the route (SiteHeaderNav still links to it fine).

### Potential concerns to address:
- Write-side (admin photo upload via Vercel Blob + TipTap learnings editor) is next; needs
  `@vercel/blob` + a BLOB_READ_WRITE_TOKEN env (won't upload locally without it) and TipTap deps.
- Recap learnings render admin-authored HTML via dangerouslySetInnerHTML; `sanitizeRecapHtml`
  is a light defense-in-depth strip, not a full allowlist parser (authorship is admin-only).
- Upcoming section currently shows to everyone (qualification-for-claimed logic deferred per spec).

## Progress Update as of 2026-06-05 1:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Completed Phase 0. Built `syncEventAttendees()` (email matching + idempotent upsert,
per-event error resilience), wired it into the admin Luma sync route, and added an
attendee-count column to the admin events list. 9 tests green; tsc clean. E2E sync ran
against the 3 real June events on dev: 169 attendees pulled, correct RSVP statuses, 0 errors.

### Detail of changes made:
- `src/lib/event-attendees-sync.ts`: `matchEvaluationIdByEmail` (profile_emails →
  found_email fallback) + `syncEventAttendees({fetchGuests?})`. Per-event try/catch so a
  403 on one event doesn't abort the rest; returns `{events, attendees, matched, errors}`.
- `src/app/api/admin/events/sync-luma/route.ts`: now also calls `syncEventAttendees`,
  returns counts; maxDuration bumped to 60s.
- `src/app/(authed)/admin/events/page.tsx`: "Attendees" column (total · matched).
- Tests: `tests/app/event-attendees-sync.test.ts` (match + idempotent + resilience; self-
  cleans created rows). `tests/lib/event-attendees.test.ts` (7 pure-fn tests).
- **E2E result on dev:** Summer Solstice 119 total/96 approved, two District dinners
  22/20 and 22/17, etc. `matched=0` on dev because the dev DB has **0 profile_emails and
  0 found_email** rows (261 evals, all email-less) — matching is correct, just nothing to
  match on dev. Real matches will occur in prod.

### Potential concerns to address:
- Matching-dependent features (Phase 2 analytics, Phase 6 directory) cannot be verified
  against real matches on dev — dev profiles have no emails. Verify those via seeded
  integration tests (as Phase 0 does), not the live Luma import.
- Dev DB now holds the user's real Luma events + 169 attendee rows (useful test data;
  does not leak to prod).

## Progress Update as of 2026-06-05 12:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Started Phase 0 (attendance foundation). Built the Luma get-guests client, the pure
guest→attendee mapper (TDD, 7 tests green), the `event_attendees` table + migration
`0033_wakeful_thaddeus_ross.sql`, applied to the dev DB. Sync routine + admin wiring next.

### Detail of changes made:
- `src/lib/luma.ts`: added `LumaGuest` type + `listLumaGuests(eventApiId)` (paginated).
- `src/lib/event-attendees.ts`: pure `mapApprovalStatus` + `lumaGuestToAttendeeValues`
  (lowercases email via `normalizeEmail`, parses dates null-safe, leaves evaluationId null).
- `src/db/schema.ts`: `eventAttendees` table, unique `(event_id, luma_guest_api_id)`.
- Migration applied to dev (ep-old-shadow) by running the 0033 SQL directly — dev DB is
  push-managed so its drizzle migration journal is empty; `drizzle-kit migrate` would try
  to replay all 33. Prod migration is the user's job at merge time.
- Plan: `docs/superpowers/plans/2026-06-05-event-followups-phase0-attendance.md`.

### Potential concerns to address:
- Dev DB migration journal is out of sync with `drizzle/` (push-managed). Applying single
  migrations by hand works for dev but means `drizzle-kit migrate` can't be used here.
- The user must run migration 0033 against prod before/at merge (no auto-migrate on deploy).

## Progress Update as of 2026-06-05 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Brainstormed the full "Event Followups" feature with DROdio and wrote the
master PRD to `docs/superpowers/specs/2026-06-05-event-followups-design.md`. No app code
yet — design/spec only.

### Detail of changes made:
- Created the branch/worktree `worktree-event-followups` off `origin/main` (5ab4446).
- Verified the Luma `get-guests` endpoint works with our `LUMA_API_KEY` against all
  three June 2026 events — returns `approval_status` (RSVP), `email` (join key to
  `evaluations`), `checked_in_at`, etc. This is the backbone of attendance tracking and
  unblocks analytics, the attendee directory, and the Connect flow.
- Decomposed the feature into 7 independently-shippable phases:
  0 attendance foundation, 1 public recap pages (carousel + learnings), 2 public
  analytics, 3 hosts (many-to-many, cross-event stats), 4 sponsors, 5 event priorities,
  6 attendee experience (gated learnings/photos, contact sharing, Connect + consent).
- Key decisions captured in the spec: Vercel Blob for images, TipTap for rich text,
  email-based Luma↔profile matching, spider averaging via `rawVectorPoints()`, attendee
  gate = RSVP approved + claimed profile, public `/events` lists past events to all.
- Three June events on Luma: `evt-6jPdDVqdWGqPjaf` (Jun 1, District), `evt-QD6R9g8xiH5PFDx`
  (Jun 2, Agate Hound), `evt-TeYXZeBsRp6cfjz` (Jun 3, District).

### Potential concerns to address:
- Image upload (Vercel Blob) and a rich-text editor (TipTap) are both net-new infra —
  not present in the codebase today; first use lands in Phase 1.
- Profiles are keyed on `linkedinUrl` but Luma gives us `email`; matching relies on
  `evaluations.email` + `profile_emails`. Some guests won't match (no profile) — by
  design they're stored email-only and excluded from profile-based analytics.
- Neon-HTTP has no `db.transaction()`; use `db.batch()` for atomic multi-statement work.
- Crons are prod-only here, so guest-sync stays admin-triggered until a later phase.
