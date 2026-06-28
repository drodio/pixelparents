## Progress Update as of 2026-06-22 09:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Generalized the docs per-section deep links into a reusable mechanism and applied
it to the **event detail page** (`/events/[slug]`): every section header (Hosted
by, Sponsors, Event Description, Post-Event/Member/Attendee learnings, Personalized
Learnings, Attendee Insights, Chat, Attendees, Your connections, Connect with other
attendees) now has a hover copy-link and supports `?section=<label>` deep-link
scrolling, e.g. `/events/9nj5he2k?section=Member+Learnings`.

### Detail of changes made:
- `src/lib/section-anchors.ts` (NEW): shared pure helpers `slugifyHeading`,
  `sectionParam`, `sectionUrl` (moved out of docs.ts).
- `src/components/SectionHeading.tsx` (NEW, "use client" so it's usable in both
  server + client trees): renders a heading with id/data-section + a `FiLink`
  hover anchor. `label` drives the link; `children` overrides display text (used
  for the per-viewer "… for {firstName}" sections).
- `src/components/SectionAnchors.tsx` (NEW, client): document-level delegated
  copy-on-click (+toast) and `?section=` scroll-on-load (80ms defer so client
  sections mount first). Mounted once per page.
- `src/lib/docs.ts`: renderer now emits `class="section-h"` + `class="section-anchor"`
  and imports the shared helpers; DocPageView dropped its inline effects for
  `<SectionAnchors/>`.
- `src/app/globals.css`: `.docs-anchor` → `.section-anchor`; hover reveal now also
  keys off `.section-h` headings (used outside `.docs-prose`).
- Event page + child components (AttendeesTable, EventChat, ChatComposer,
  RecommendedConnections, PersonalizedLearnings) use `<SectionHeading>`; event
  page mounts `<SectionAnchors/>`.
- Tests updated for the `section-anchor` class.

### Potential concerns to address:
- Merged `origin/main` (which now carries #420's `docs-anchor`); resolved every
  hunk to this branch's `section-anchor` refactor (supersedes #420's inline path).
  Follow-up commit stripped dead inline effects/`articleRef`/`copied` that the
  merge resurrected in `DocPageView` (roborev #154, VALID) — view uses
  `<SectionAnchors/>`.
- Docs images: user saved events-connect-attendees.png + events-accept-requests.png
  to public/images/docs/; inserted into `content/docs/events.md` (Connecting with
  attendees: connect image above the intro line, accept-request image below the
  "Initiating a connection" bullet). Prod is DB-backed → needs a re-seed (only
  writes if the events page is still seed-owned).

## Progress Update as of 2026-06-22 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Docs section headings now have per-section deep links. A custom `marked` heading
renderer gives every h2/h3 an `id` (slug) + `data-section` + a hover "copy link"
anchor pointing at `?section=<label>` (spaces as `+`, matching the requested
`?section=Connecting+with+attendees` format). `DocPageView` adds a delegated
click handler that copies the absolute deep link + shows a toast, and a mount
effect that smooth-scrolls + briefly highlights the target section when the page
is opened with `?section=`. The h1 page title stays plain.

### Detail of changes made:
- `src/lib/docs.ts`: switched to a dedicated `new Marked()` instance with a
  `heading` renderer (id/data-section/anchor); added `slugifyHeading` +
  `sectionParam` helpers + inlined Feather link-icon SVG.
- `src/components/docs/DocPageView.tsx`: `articleRef`, copy-on-click delegation
  (writes `…?section=…` to clipboard, `history.replaceState`), scroll-to-section
  on load, "Link copied to …" toast.
- `src/app/globals.css`: `.docs-anchor` hover-reveal styling + `.docs-section-target`
  flash + `scroll-margin-top` on h2/h3.
- Tests: renderMarkdown anchor/h1 cases in `tests/app/docs.test.ts`.

### Potential concerns to address:
- PENDING (blocked on user): add the "Connect with other attendees" screenshot to
  the Connecting-with-attendees section of `content/docs/events.md`. The pasted
  image isn't on disk; user must save it to `public/images/docs/` first. Docs are
  DB-backed, so it also needs a prod re-seed (only writes if the page is still
  seed-owned).
- Merged latest `origin/main` (now at #418-era) back into the branch; only PRD
  conflicted. Follow-up commit de-dups heading slugs via `uniqueHeadingId` +
  per-render `slugCounts` (roborev #134 finding 1, VALID): repeated headings get
  `id`, `id-2`, … (findings 2 YAGNI / 3 invalid closed with comments).

## Progress Update as of 2026-06-14 12:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the header alignment on every full-header page. The account chrome (Admin
pill + avatar / Log in) is a `sm:fixed sm:top-3` overlay from the (authed) layout,
but every page header sat ~48px down (`py-8 sm:py-12`), so the nav row rendered a
full row BELOW the account chrome. Reduced the top padding to `pt-3 sm:pt-4`
(kept bottom padding) so the logo+nav row rises into the same top band as the
chrome. Verified with headless-Chrome screenshots (leaderboard before/after).

### Detail of changes made:
- Wrapper top padding `py-8/py-10/py-12` → `pt-3 … sm:pt-4 …` (bottom unchanged) on:
  events/page, events/[slug]/page, leaderboard/page, profile/page, hosts/page,
  hosts/[slug]/page, sponsors/page, sponsors/[slug]/page, changelog/page.
- Applied uniformly (not just /events, which is where DROdio reported it) so the
  pages stay consistent — they all shared the identical issue.

### Potential concerns to address:
- /docs is NOT under (authed) so it has no fixed account chrome; left as-is.
- Pre-existing (untouched) lint: logo `<a href="/?home=1">` + `<img>` on these
  pages trip no-html-link-for-pages / no-img-element (CI lint is informational).

## Progress Update as of 2026-06-14 11:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added breadcrumbs to every admin page (mirrors the /account "Profile › Account"
style). Derived automatically from the URL path in the admin layout, so e.g.
`/admin/events/<id>` renders "Admin › Events › <event title>". Dynamic ids for
events/hosts/sponsors/support tickets resolve to their human name; other ids fall
back to a shortened id; unknown segments are title-cased.

### Detail of changes made:
- `src/lib/admin-breadcrumbs.ts` (NEW): `buildAdminBreadcrumbs(pathname)` →
  `Crumb[]`. STATIC_LABELS map for known segments; ID_RESOLVERS (events.title,
  hosts.name, sponsors.name, supportTickets.subject) for uuid segments under
  their collection; UUID-shortId + titleCase fallbacks. Best-effort (catches).
- `src/components/admin/AdminBreadcrumbs.tsx` (NEW): presentational trail, amber
  links + › separators, current page in zinc-200; renders null for <2 crumbs (so
  the bare /admin dashboard shows nothing).
- `src/app/(authed)/admin/layout.tsx`: builds crumbs from the `x-pathname` header
  (already read for the accept-invite check) and renders `<AdminBreadcrumbs>` at
  the top of `<main>`, above children.
- Tests: `tests/lib/admin-breadcrumbs.test.ts` (pure path parsing + fallbacks).

### Potential concerns to address:
- Name resolution adds up to one small DB lookup per admin detail-page load
  (events/hosts/sponsors/support only); indexed PK lookups, negligible.
- Merged latest `origin/main` (incl. the squashed support/docs-nav work) back in;
  conflict was PRD-only.

## Progress Update as of 2026-06-14 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Support-ticket UX round (user-facing). Three asks: (1) the filer's status now
reads "Pending" (open, no admin reply) / "Responded" (open, admin replied) /
"Closed" instead of raw open/closed; (2) the filer now gets a confirmation email
with their ticket URL on creation (previously only the admin inbox was emailed);
(3) the filer can reopen a closed ticket they don't feel was fully resolved.

### Detail of changes made:
- `src/lib/support.ts`: `SupportTicketWithReply` type + pure `userTicketStatus` /
  `userTicketLabel` helpers; `listMyTickets` now returns an `adminReplied` flag
  (computed via a second `selectDistinct` over admin messages, not a correlated
  `exists` subquery, which returned false under the neon HTTP driver). New emails
  `emailUserTicketCreated` (filer confirmation) and `emailAdminReopened`.
- `src/app/api/support/route.ts`: send `emailUserTicketCreated` after create.
- `src/app/api/support/[id]/reopen/route.ts` (NEW): owner-or-super-admin reopen;
  owner reopens ping the admin inbox.
- `src/components/docs/SupportThread.tsx`: actor-aware status label/badge (admin
  keeps Open/Closed); user reopen button + helper text on closed tickets.
- `src/app/docs/support/page.tsx`: list badges use the Pending/Responded/Closed
  labels + colors.
- Tests: pure status-label tests + `adminReplied` assertions in support.test.ts.

### Potential concerns to address:
- Reopen is owner-or-super-admin; close stays super-admin-only (intentional).
- Confirmation/reopen emails are best-effort (`.catch(() => {})`), like the rest.

## Progress Update as of 2026-06-14 10:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a "Docs" item to the global `SiteHeaderNav`, to the right of "Events". It
renders on every page that uses the header (profile, leaderboard, events,
changelog, docs); it's a public link (no claim gate). `currentPage="docs"` was
already wired from `/docs/layout.tsx`, so the active-tab styling works there too.

### Detail of changes made:
- `src/components/SiteHeaderNav.tsx` — new `NavItem label="Docs" href="/docs"`
  after Events, before `HeaderSearch`.

### Potential concerns to address:
- None new. SiteHeaderNav is the single source for these items (no duplicate
  mobile menu to keep in sync).
- Merged latest `origin/main` (chat edit/delete #393, nfx cookie #392, event
  collapsible sections #385) into this branch; conflicts were PRD-only (this
  file) plus a clean auto-merge of SiteHeaderNav.

## Progress Update as of 2026-06-12 07:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Docs polish branch off main (post-#384). Four changes: (1) removed all 51 em
dashes from `content/docs/*.md` → `:` for definitions/lists, `,` for asides;
(2) swapped the docs left-nav emoji for `react-icons/fi` icons; (3) gave `/docs`
the full `SiteHeaderNav` header like /leaderboard + /changelog; (4) made the
super-admin suggestion review a red/green word-diff (dep `diff`), ordered
newest-first. Full detail lives in [docs-section.md](docs-section.md) under the
same date.

### Detail of changes made:
- `content/docs/*.md` rewritten (em-dash-free). DB-backed → PROD needs a re-seed
  via `seed-docs.ts` to go live (dev already re-seeded).
- `src/components/docs/DocsNav.tsx` — react-icons ICONS-by-slug map + FiMenu.
- `src/app/docs/layout.tsx` — async; logo + `SiteHeaderNav currentPage="docs"`;
  added "docs" to `SiteHeaderNavPage`.
- `src/lib/docs.ts` — `renderDiffHtml` (diffWords), `listPendingSuggestions` desc.
- `DocPageServer`/`DocPageView` — diff per suggestion vs current body + legend/date.

### Potential concerns to address:
- PROD content refresh is a DB action (re-run `seed-docs.ts` on prod); rows are
  still seed-owned so no clobber.
- Local DB-backed vitest flaky on Neon pooled-endpoint connect timeouts; CI runs
  them on the Neon test branch.
