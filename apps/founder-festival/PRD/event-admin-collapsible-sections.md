## Progress Update as of 2026-06-12 6:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Resolved a second conflict with main on the event page (main switched the View-public-page
link to an icon button). Kept the CollapsibleSection restructure, adopted main's icon link.
10 balanced CollapsibleSection pairs, typecheck + build clean. CI (Actions billing restored)
is green; merging now.

## Progress Update as of 2026-06-12 5:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `origin/main` into the branch to resolve a conflict on the event page:
main switched `EventDetailsEditor` to `initialDescriptionHtml={descriptionToHtml(...)}`.
Kept the CollapsibleSection wrapper, adopted main's new prop. Typecheck + `next build`
clean after merge. (The earlier PR #385 CI red was on a now-expired run; re-running via
this push.)

## Progress Update as of 2026-06-12 4:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Restructured the admin event detail page (`/admin/events/[id]`) into collapsible
sections with globally-persisted (localStorage, cross-event) open/closed state, per
DROdio's specs. This is the foundation for the larger "attendee emailing system" (more
specs to come). No DB migration. Unit tests pass; `next build` clean.

### Detail of changes made:
- New `src/components/admin/CollapsibleSection.tsx` (client): clickable section header
  (chevron + title) that hides/keeps-mounted its children when collapsed. Collapsed set
  is GLOBAL per section key (not per-event), persisted via `useSyncExternalStore` +
  localStorage (mirrors `AdminProfileBox` / `admin-box-state.ts`). When collapsed and
  `badgeCount > 0`, shows the count in bold red on the title (matches the left-nav
  pending badge, `text-red-500`).
- New `src/lib/event-section-state.ts`: pure `readCollapsed`/`writeCollapsed`/
  `toggleCollapsed` over key `ff:eventAdmin:collapsedSections` (JSON array of collapsed
  keys). Unit-tested.
- `admin/events/[id]/page.tsx` restructured:
  - Header (title/capacity/slug/view-link/Luma re-import) stays non-collapsible.
  - Removed the "Recap & content" title.
  - New "Attendance Requests" collapsible wraps the applicant queue (status pills +
    filters + table); red pending count on the collapsed title.
  - "Attendees" moved directly below Attendance Requests.
  - Every section now collapsible: Attendance Requests, Attendees, Description,
    Date & time, Hosts, Sponsors, Badges, Photos, Event priorities, Learnings.

### Potential concerns to address:
- Visual check of the auth-gated super-admin page couldn't be done headlessly — verified
  via build/types/tests + pattern reuse; DROdio to eyeball on prod.
- Section keys are stable strings ("attendees", "photos", …); renaming a section later
  resets its saved state (acceptable).
- The "attendee emailing system" itself is still to come (this batch = the section reorg
  foundation).
