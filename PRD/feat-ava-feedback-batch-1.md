# feat/ava-feedback-batch-1

Source of truth for this branch: **"Go Pixel Changes"** — the Google Doc Ava
compiled from talking with OHS parents (tabs: Ava Notes / Ava Changes / Sofia
Changes / To-Do's), plus the affiliation-disclaimer request relayed from an OHS
staff contact via Daniel.

## Progress Update as of [July 31, 2026 — 7:33 PM Pacific]

### Summary of changes since last update

Third commit: collapsed the desktop secondary filters behind a "More filters"
disclosure on both Directory and Community, then verified the whole branch in a
real browser. Typecheck + lint clean, 874/874 tests pass.

### Detail of changes made:

- **"More filters" disclosure on desktop.** Both surfaces already collapsed
  their secondary filters into a mobile bottom sheet; on md+ they sprawled
  inline, which is what parents found overwhelming.
  - `app/(authed)/directory/showcase-client.tsx` and
    `app/(authed)/community/exchange-board-client.tsx` now wrap the shared
    `secondaryControls` in a toggle button that reads "More filters" /
    "Fewer filters" and carries the same active-filter count badge the mobile
    button uses.
  - Directory starts OPEN when the page loaded with filters already applied
    (interests / non-default sort restored from the URL), so a shared or
    bookmarked link never looks filtered for no visible reason. Community has no
    URL-restored filter state, so it starts closed.
  - The mobile sheet path is untouched — `secondaryControls` still mounts in
    exactly one place, guarded by the existing `isMobile` check.

### Browser verification (dev server, localhost)

Actually exercised, not just typechecked:

- Landing: disclaimer renders under the CTA and reads correctly.
- Signup role switching, all three roles:
  - parent → section titled "First parent's info", WeChat field PRESENT
  - student → "Your info" + the parent-invite note (the reported bug is fixed)
  - alum → "Your info" + the reworded welcome-back note, no parent mention
  - WeChat field correctly ABSENT for student and alum (asserted via DOM)
- Sidebar renders signed-out and shows the new order: Dashboard, Community,
  Resources, Events, Directory, Family, Developers.
- The two filter disclosures are behind auth and were NOT exercised live — they
  typecheck and lint but still need an eyeball with a signed-in account.

### Potential concerns to address:

- **Pre-existing, not from this branch:** the landing and signup pages log React
  hydration mismatches from `components/` `InterestTiles` — inline styles are
  emitted as numbers client-side (`left: 611.61`) vs `"611.611px"` strings
  server-side. Harmless today but it's a real mismatch and worth a separate fix.
- The Directory disclosure's open-on-load condition checks interests and sort but
  NOT the age or radius filters, because those aren't part of `initialState` in
  the same shape. A URL restoring only an age range would open collapsed with a
  count badge showing. Minor, but it's an inconsistency.

## Progress Update as of [July 31, 2026 — 7:27 PM Pacific]

### Summary of changes since last update

Second commit on this branch: the Events half of Ava's doc. Fixed the
online/in-person mislabelling at its root (the importer, not the data) and made
the event organizer's name link to their profile. Typecheck + lint clean,
874/874 tests pass (5 new).

### Detail of changes made:

- **Online vs in-person tags were wrong for EVERY OHS event, not just a few.**
  `lib/db/events.ts` hard-coded `isOnline: false` on import, and `PlaceBadge`
  (`app/(authed)/events/event-bits.tsx`) renders anything not-online as
  "In person". So all ~30 imported school-calendar entries showed "In person",
  which is why Ava saw it on both PTC and Back to School Night. Stanford OHS is
  an *online* school, so the default was backwards.
  - New `isOhsEventOnline(title)` in `lib/events/ohs-parser.ts`: defaults to
    online, flips to in-person only on an explicit on-campus hint
    (`graduation`, `commencement`, `reunion`, `on campus`, `in person`,
    `summer session`, `summer institute`). Case-insensitive substring match.
  - Extending it for the rest is a one-line list addition — that's the hook for
    Ava's offer to flag more manually.
  - Applied on insert **and** in the `onConflictDoUpdate` set block. The update
    path matters more than the insert: rows are already in the table with
    `isOnline=false`, so without it the existing bad tags would never heal. They
    correct themselves on the next OHS sync.
  - 5 new tests in `lib/events/ohs-parser.test.ts` covering Ava's two reported
    cases, calendar markers, on-campus hints, and case-insensitivity.
- **Organizer now links to their profile** (Ava: parents with questions had no
  way to reach whoever created an event).
  - New `authorTokensForEvents(rows)` in `lib/db/events.ts`: batch-resolves
    `author_signup_id` → `share_token`, gated on `hasShareableProfile` (the same
    gate the community thread uses), so it can't surface a profile the viewer
    isn't allowed to open.
  - `authorToken` threaded through `CalendarEvent` → `toCalendarEvent` → both
    call sites (`events/page.tsx`, `events/[id]/page.tsx`).
  - `events-calendar-client.tsx` renders the organizer as a `<Link>` to
    `/directory/<token>` when present, plain text otherwise (OHS imports and
    non-shareable profiles are unchanged).

### Potential concerns to address:

- The in-person hint list is heuristic. It will mislabel an on-campus event whose
  title doesn't contain any hint word. Defaulting to online is the safer error
  for an online school, but it IS a guess — a real `is_online` field on the OHS
  source would be better if the calendar ever exposes one.
- Existing OHS rows only correct themselves when the sync next runs. Worth
  confirming the sync is scheduled (or triggering it once) rather than assuming.
- `authorTokensForEvents` adds one extra `signups` query to the events page. It's
  batched and id-scoped, so it should be cheap, but it is a new query on a hot path.

## Progress Update as of [July 31, 2026 — 7:19 PM Pacific]

### Summary of changes since last update

First entry. Landed the "quick wins" half of Ava's parent-feedback doc: sidebar
reorder, the signup role-labelling bug that blocked students and alums, the
stale PixelParents OG title, an optional parent WeChat field (new column), and
the affiliation disclaimer on the home page. Typecheck clean, 869/869 tests pass.
Events/filters/resources items from the same doc are NOT in this branch yet —
see "Still open" below so the next session doesn't redo what's done here.

### Detail of changes made:

- **Sidebar reorder** (`components/dashboard-shell.tsx`). Now Dashboard →
  Community → Resources → Events → Directory → Family → Developers. Parents
  reach for Resources far more than the calendar, so it moved above Events.
  `MOBILE_PRIMARY_HREFS` already contained `/resources`, so the phone tab bar
  needed no change.
- **Signup: the student/alum blocker** (`app/signup/signup-form.tsx`). Root
  cause was NOT step ordering, which was already correct — the section that
  collects the signing-up person's own details was hard-titled *"First parent's
  info"* for every role, so a student or alum read it as "enter a parent before
  yourself." Title is now role-aware ("Your info" for student/alum, "First
  parent's info" for parent and co-parent-join). Fields underneath unchanged.
- **Signup: merged the two role headers.** Removed the `description`
  ("This tailors the next step to you") and demoted the duplicate
  `I'm signing up as` legend to `sr-only`, so "Who's signing up?" reads as one
  question instead of two stacked ones. Fieldset keeps its accessible name.
- **Signup: alum note no longer mentions parent profiles** — alums have no
  parent-link step, and raising one implied a step that doesn't exist.
- **Signup: LinkedIn copy** — "this really helps" → "this helps".
- **WeChat ID (new, parent-only).** Many OHS families coordinate on WeChat
  rather than LinkedIn/email.
  - `lib/db/schema/signups.ts`: `wechatId: text("wechat_id")`, nullable.
  - `lib/db/ensure.ts`: self-heal DDL `ALTER TABLE signups ADD COLUMN IF NOT
    EXISTS wechat_id text` (matches how every other column in this repo is
    added — there is no run-migrations step).
  - `app/signup/actions.ts`: added to `SignupPatch` + `sanitizeSignupPatch`
    (trim, 60-char cap, empty → null).
  - `app/signup/signup-form.tsx`: field rendered only for parents and
    co-parent-join; wired into `empty` and the pre-submit `save()` payload.
- **Stale branding** (`app/layout.tsx`). OG + Twitter title were still
  "Pixel Parent Tech: Join our Builder Community" — this is what rendered in
  link previews (visible in a screenshot Daniel shared). Now
  "GoPixel: Join our Builder Community".
- **Affiliation disclaimer on the home page** (`app/page.tsx`). It previously
  existed only on `/privacy` and `/terms`. An OHS staff contact said moving it
  to the home page was his single ask; Daniel asked to keep it fun. Sits under
  the hero CTA, warm framing, but the operative phrase "not affiliated with or
  endorsed by" is verbatim-identical to the legal pages so the three can't drift.

### Verification run

- `npm run typecheck` — clean.
- `npm run test` — 72 files, 869 tests, all passing.
- Not yet exercised in a browser; the signup role-title change should be
  eyeballed for all three roles before merge.

### Still open from the same doc (NOT done here — do not assume these are built)

- Events: "Open event" button reported broken. Route `/events/[id]` DOES exist
  (`app/(authed)/events/[id]/page.tsx`), so this is not a missing page — needs a
  live repro. Suspect the overlay in
  `app/(authed)/events/events-calendar-client.tsx:634` swallowing the click.
- Events: link the organizer to their profile so parents can reach them.
- Events: in-person vs online tags wrong (PTC and Back to School Night are both
  mis-tagged in-person). Ava offered to flag the rest manually.
- Community + Directory: collapse the detailed interest filters behind a
  "More filters" disclosure.
- Resources: let a community reply link a resource board.
- Deferred by Ansh: **light mode** and the OHS-matching color scheme (explicitly
  out of scope for now — `app/globals.css` is dark-first with hardcoded
  `text-white/*` and `border-white/*` throughout, so it's a full token audit).
- Bigger asks, unscoped: daily digest notifications, global search,
  relevance-ranked directory profiles.

### Already shipped previously — do NOT rebuild

Checked against the Jul 7 Live Session (Daniel + Devina). Everything actionable
from that meeting is already merged:

- Shared-interest matching, interest dedup, `interest_match` notifications — #184
- Resource boards linking to external group chats — #183
- Alum role + community landing + 3-way directory (Daniel's "make it less
  parent-centric" flip) — #189
- Unified AI profile enrichment — #187
- Student contact gated behind parent 16+ certification — #185
- Admin-side email correction — noted as done in the meeting itself
- Better domain (gopixel.org) — done

Only genuinely-open item from that meeting: Devina's idea to make interest tags
hierarchical (`book → fantasy → title`) instead of one flat list, to cut how many
options a user scrolls.

### Potential concerns to address:

- `wechat_id` is written but nothing **reads** it yet — it does not appear on the
  profile, directory card, or family member card. Either surface it or the field
  is write-only from a user's point of view. Follow-up needed.
- The no-JS `formData` path in `app/signup/actions.ts` (~line 398) does not carry
  `wechatId`. That path also already omits `websiteUrl` and `enrichmentOptIn`, so
  this is consistent with existing behavior rather than a new gap, but it means
  WeChat only persists through the normal client flow.
- The home-page disclaimer duplicates wording held in two other files. If legal
  copy changes, three files need the edit. Worth extracting to a shared constant
  if it changes even once.
- Ava's doc says the Family page "might be a bit bugged" downstream of the signup
  flow; she wants to re-check it after these signup changes land.
- Sofia's tab in the doc is still empty — a second feedback batch is coming.
