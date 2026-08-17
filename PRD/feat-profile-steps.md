# feat/profile-steps

Third branch of "Go Pixel Changes V2 round 2" — the big one: the member's OWN
info gets its own wizard pages (city & state, social links, interests, photos),
all BEFORE a rebuilt sharing step that asks one question at a time in entry
order. Stacked on `feat/verify-required` (PR #214) — merge that first.

## Progress Update as of [August 16, 2026 — 8:10 PM Pacific]

### Summary of changes since last update

First entry. Four new self-info wizard steps + the entry-order share sequence +
Instagram/X as first-class profile links. The doc's two rulings implemented
literally: "you did not ask them to fill in the information regarding
themselves", and "how can they share information they did not yet fill out."

### Detail of changes made:

- **`profile-steps.tsx` (new)** — StepCityState (CityAutocomplete + country/US
  state, mirroring the /family member-card rules: picking a suggestion fills
  country + state, leaving the US clears the state), StepInterests (TagPicker
  against the shared interest pool), StepPhotos (the existing PhotoUploader,
  first-photo-is-main). All save via patchSignup + the shared autosave hook, so
  Continue/Skip never blocks on a round trip. These fields previously had NO
  onboarding surface at all — they were only editable later on /family.
- **`social-links-step.tsx` (new)** — the doc's dropdown-adder, verbatim:
  platform dropdown + handle input per row, "Add another link" until all five
  (LinkedIn, GitHub, WeChat, Instagram, X) are used. Each platform writes the
  field the rest of the app already reads; removing a row clears the field.
- **`lib/social-handles.ts` (new, pure, 7 tests)** — handle normalization
  (strips @, unwraps pasted instagram/x/twitter URLs, filters to allowed
  chars, caps 30) + extra-jsonb readers + URL builders. `sanitizeSignupPatch`
  gains `instagramHandle`/`xHandle` keys storing into extra jsonb (no schema
  drift — same pattern as websiteUrl).
- **`components/profile-view.tsx`** — Instagram + X pills next to
  LinkedIn/GitHub, behind the same opt-in "links" share field. New
  IconInstagram; X reuses the existing X glyph.
- **`share-sequence.tsx` (new)** — the wizard's sharing step: master question
  ("list your profile in the directory at all?" → visibility ohs/private),
  then one question per piece of EXISTING info, in the doc's fixed order:
  city&state → phone → email → socials (links+wechat flip together) → interests
  → photos → children. Crucially the question list is fetched via
  `getShareSetupState` (new server action) when the member STARTS the
  questions, not at page load — the wizard's earlier steps fill these very
  fields, so a load-time snapshot would wrongly skip anything added minutes
  ago. Answers write the same share_visibility/share_fields the /account panel
  edits, so the two can never disagree.
- **`onboarding-steps.ts` + tests** — city/socials/interests/photos inserted
  between the role step and sharing; a test pins every self-info page BEFORE
  the share step. Step-order tests updated to the 8-step flow.
- **`page.tsx`** — presigns the member's own photos, unwraps the stored
  linkedinUrl into a handle for the socials step, renders the new step nodes;
  the editing layout still uses the original ShareSettings panel.

### Verification run

- Post-rebase onto feat/verify-required: typecheck / lint / test / build all
  exit 0 per-step. 1055 tests (1047 on the #214 stack + 8 net new here: 16 in
  the new files, 8 prior expectations replaced by order-aware versions). The
  rebase auto-merged; the one stale piece was clampForward's index expectations
  (written for the 4-step flow), rewritten position-independent.

### Potential concerns to address:

- **Stacked on feat/verify-required** — same file, both branches (steps
  builder, tests, page). Rebase resolved here so the PR merges clean AFTER
  #214; merging this first instead would conflict.
- **Not live-clicked.** Same caveat as the wizard PR: unit-tested logic +
  green build, but the full parent and student click-throughs (esp. photo
  upload inside the wizard and the share sequence against a real row) are on
  Ava's signed-in QA list.
- The doc's student-flow closer — "which parent profile you're connected to" —
  has NO share key today (student cards don't render family links), so the
  sequence omits it for students. Adding one is a product decision: new share
  field + card rendering.
- The socials step trusts `patchSignup`'s row-id capability like every other
  thanks surface; Instagram/X handles are normalized server-side, so a pasted
  full URL or @name stores clean regardless of client behavior.
