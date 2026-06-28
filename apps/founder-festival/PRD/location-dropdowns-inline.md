## Progress Update as of 2026-05-28 07:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three things on the location feature:

1. **Inline layout when nickname is set.** The fullName subtitle row
   ("Daniel R. Odio [LI]") now also shows "| San Mateo, California,
   United States" appended. No nickname → location stays on its own row
   below the welcome line (unchanged).
2. **Country + State dropdowns.** Country is a dropdown of ~50 curated
   countries (reusing existing `COUNTRIES` from `country-codes.ts`).
   When country == United States, the State field is a dropdown of all
   50 US states + DC + territories. Other countries get a free-text
   region input. Country defaults to United States when blank so the
   state picker is one click away.
3. **Public visibility confirmed.** Location is already public to
   non-owners (no gating in the data flow). DROdio reported it wasn't
   visible; the most likely cause was a stale browser view after editing.

### Detail of changes made:
- `src/lib/us-states.ts` (new): US_STATES constant — 50 states + DC + the
  5 inhabited territories. Each entry has both `code` (postal abbrev) and
  `name` (full).
- `src/components/LocationLine.tsx`:
  - New `mode: "inline" | "block"` prop. Default `block` = current
    behavior. `inline` renders as "| <location>" with the pen icon
    linking to /account#location (no inline editor in inline mode — the
    fullName subtitle row would be too cramped for it).
  - Edit form now uses Country select (default US), State select
    (when US), and free-text State input (when not US). City stays
    free-text.
  - When the user switches INTO US, the State value is cleared unless it
    already matches a known state name. Switching OUT of US keeps the
    free-text value.
- `src/app/(authed)/profile/page.tsx`:
  - When nickname && fullName: renders `<LocationLine mode="inline" />`
    INSIDE the subtitle row, after the LinkedIn icon.
  - When no nickname: renders block-mode LocationLine below the welcome
    line (unchanged from previous behavior).
- `src/app/(authed)/account/page.tsx`: added `id="location"` to the
  Location section so the inline-mode pen's `/account#location` link
  scrolls to it.

### City validation — recommendation:
DROdio asked whether city should be validated. My recommendation: skip
in this iteration. The realistic options for real city validation are:
1. **Google Places Autocomplete API** — best UX, ~$2.83/1k requests,
   requires a billing-enabled Google Cloud project.
2. **Mapbox Geocoding** — ~$0.50/1k requests, simpler setup, slightly
   less accurate for small places.
3. **Static cities1000 dataset** — ~150k cities worldwide, ~3MB. Ships
   with the app, no per-request cost, no autocomplete UX without
   client-side typeahead logic.

For a feature where the user types their own real city, country + state
dropdowns prevent the bulk of typos (and the "United States" → state
dropdown rules out invalid state names entirely). I'd add city
autocomplete only if profile data quality drops noticeably. Captured as
a follow-up.

### Potential concerns to address:
- The `COUNTRIES` list (in `country-codes.ts`) is curated for SMS dial
  codes and is ~50 countries, not the full ISO 3166 list. If a user's
  country isn't represented they can't pick it. Easy to extend the
  array; out of scope here.
- Inline mode has no inline editor. Owner has to visit /account to edit
  when they have a nickname. The pen icon does link there with the
  #location anchor, so it's one click.
