# connect-respond-oneclick

## Progress Update as of 2026-06-22 04:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Enriched the intro email's profile bullets: each line is now "**Name** (bold,
links to profile): credibility title (+ view their Deep Intelligence dossier)".
Per the user: keep the name→profile link as-is, the title is plain text (not a
link), and the dossier text links out only when a ready dossier exists.

### Detail of changes made:
- `src/lib/email.ts` `buildConnectionIntroEmail` — bullets now render
  `<a href=profile><strong>Name</strong></a>: <title>` plus
  ` (+ view their <a href=dossier>Deep Intelligence dossier</a>)` when a dossier
  URL is passed. New opts: `titleA/titleB`, `dossierUrlA/dossierUrlB`.
  `sendConnectionIntroEmail` opts extended to match.
- `src/lib/attendee-connections.ts` `introduceConnection` — selects
  `credibilityTitle` for both people and looks up each one's dossier
  (`getProfileDossier` + `isDossierViewable`), passing title + dossier share URL
  to the email.
- Test: added a case asserting title (plain) + conditional dossier link, and
  updated the existing bullet assertions to the bold-name format.

## Progress Update as of 2026-06-22 04:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Bundle of connection-flow polish: the email approve/deny link now auto-completes
on page load (no second click), names/events are hyperlinked in both the email and
the respond page, the request email is restyled (green Approve, red-outline Deny),
the event date is fixed (Pacific TZ) and moved to the body, and the intro email
gains an event-chat deep link.

### Detail of changes made:
- **One-click approve** — `src/components/events/ConnectionRespond.tsx` now
  auto-fires the decision POST on mount (ref-guarded), so the email-button click
  lands straight on the result. Safe vs. email scanners/prefetchers: they only do
  GET and don't run JS, so the JS-triggered POST never fires for them. States:
  busy → done | handled (already-decided 404) | error.
- **Respond page** (`src/app/connect/respond/page.tsx`) — the requester's name in
  the heading links to their festival profile (`canonicalProfileUrl`). Logo link
  switched to `next/link` (lint).
- `src/lib/attendee-connections.ts` — `getConnectionRequestByToken` now also
  returns `fromEvaluationId` (for the profile link).
- **Request email** (`src/lib/email.ts` `sendConnectionRequestEmail`):
  - Name → links to profile (`fromUrl`); event → links to event page (`eventUrl`).
  - Approve button green (`#16a34a`); Deny button unfilled with red border
    (`#dc2626`).
  - Date removed from the subject; shown in the body ("… on Monday, June 1, 2026").
- **Date bug fix** — `src/app/api/events/[slug]/connect/route.ts` now formats the
  date with `formatEventDateLong` (EVENT_TZ = America/Los_Angeles). The old bare
  `toLocaleDateString` rendered in UTC on Vercel, shifting evening-Pacific events
  to the next day (June 1 → "June 2"). Also passes `fromUrl` + `eventUrl`.
- **Intro email** (`buildConnectionIntroEmail`) — added above the sign-off:
  "You can also chat, reply & upvote comments with other event attendees [right
  here]." linking to `${eventUrl}?section=chat`. Test added.

### Potential concerns to address:
- The `?section=chat` deep link assumes the event page handles that param (being
  built separately) — the link is correct regardless; it just won't auto-scroll
  until that lands.
- Auto-fire slightly weakens protection vs. the rare scanner that executes JS in a
  headless sandbox. Acceptable per request; the vast majority are GET-only.
