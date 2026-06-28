# Profile location display (city/state/country)

Status: queued — not yet scheduled.
Source: DROdio request, 2026-05-28.

## What we want

Show the user's location (city, state, country) below their name on the
profile page. When a user has *claimed* their profile, they should be able
to edit those fields. Same claim-gate pattern the rating buttons and the
new privacy slider use.

## What probably already exists to build on

- The eval row likely has location signal in `profile` JSON via the
  enrichers (Exa LinkedIn scrape, etc.). Check
  `profileBlob.extractedMetrics` / linkedinPageText for raw fields. If not
  populated today, this becomes a 2-step feature: (a) capture location at
  claim time, (b) render below the name.
- The claim flow's "complete your account" step (post-claim setup) could
  prompt for location if not already captured — see
  `src/components/AccountSetupForm.tsx` for the existing setup UX (it
  prompts for email + phone today).
- Editable user fields on the profile already follow the
  `isOwner || isAdminViewer` pattern (badges, score items, ratings).

## Out of scope of this PRD

- Not started. Just captured so it doesn't get lost.
- Decisions still TBD: where exactly to render (under name? below the
  LinkedIn link? alongside the FounderScore?), how strict on "state" for
  non-US users, whether to geocode via free-text or use a dropdown.
