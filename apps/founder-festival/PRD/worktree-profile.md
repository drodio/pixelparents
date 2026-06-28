## Progress Update as of 2026-05-28 04:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pre-ship copy tweak. Removed the "Here's your FounderScore™" line above
the score column on the profile page — the big FounderScore / InvestorScore
numbers themselves already make it obvious what's being displayed.

Also queued two new requests that came in just before shipping:
- `PRD/profile-location-display.md` — show city/state/country below the
  user's name on the profile, editable when claimed. Not built.
- Memory updated with both `backlog-profile-social-card` and
  `backlog-profile-location-display` entries.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx` — deleted the `<p>` that read
  "Here's your FounderScore™" / "Here's your InvestorScore™".

### Potential concerns to address:
- The score column is now slightly more abrupt without the lead-in copy.
  If the unclaimed-state UnclaimedNotice (which renders above the scores)
  doesn't carry enough context for first-time visitors, may want to add a
  small "Score" header above the columns. Hold for user feedback.

## Progress Update as of 2026-05-28 04:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Blur + slider tweaks from user feedback. Category badge now also blurs out
on private rows for non-owners (previously only the priority text was
blurred). Switched the blur filler from solid block characters (`████`,
which rendered as a white-blob bar) to a lorem-ipsum-style letter string so
the blur reads as "blurred text" rather than a solid rectangle. Switched
the slider's selected pill color from gold (`#dfa43a`) to gray
(`bg-zinc-600 text-zinc-100`) so the toggle is less visually loud.

### Detail of changes made:
- `src/components/Recommendations.tsx`:
  - `BLUR_FILLER` (24 × `█`) → `BLUR_TEXT_FILLER` (lorem-style ~140-char
    string) + new `BLUR_CATEGORY_FILLER` ("private", uppercased via
    existing category-badge styles).
  - Category badge for non-owner-viewing-private rows now renders the
    blurred placeholder in neutral `text-zinc-500` with `blur-[2px]`
    (proportional to the small 10px font).
  - `RecItem.category` type relaxed from `string` to `string | null` so
    server can scrub the category for private rows in the same pass.
  - Slider selected pill: `bg-[#dfa43a] text-black` →
    `bg-zinc-600 text-zinc-100`.
- `src/app/(authed)/profile/page.tsx`:
  - `savedResponses` map + `prePopulated` map now use a `scrubbed`
    boolean and null out `category` (alongside `text` / `editedText`) when
    the viewer can't read the row.

### Potential concerns to address:
- The "private" word in `BLUR_CATEGORY_FILLER` is short enough that on a
  shallow blur (`blur-[2px]`) you may be able to partially decode the
  shape. If we want stronger obscurity, bump to `blur-[3px]` or pick a
  longer/less-recognizable filler. Picked 2px because at 10px font size
  3px+ looked like a smudge with no letter shape at all.
- Rating button "selected" state is still gold (`bg-[#dfa43a]`). User
  only asked about the slider pill; if they want the rating buttons gray
  too, that's a separate one-line change.

## Progress Update as of 2026-05-28 04:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
UserButton dropdown tweak: renamed "View My Public Profile" → "Public
Profile" and used Clerk's `<UserButton.Action label="manageAccount" />`
reorder marker to push the custom link above the "Manage account"
built-in. Same conditional gate (only rendered when `profileHref` is set,
i.e. the user has a claimed evaluation).

### Detail of changes made:
- `src/components/UserBadge.tsx`: relabel + reorder marker. Link still
  conditional on `profileHref`, which is computed in
  `src/app/(authed)/layout.tsx` from `users.evaluation_id`.
- On a brand-new Clerk instance (or any user who hasn't claimed yet), the
  link still doesn't render — by design.

### Potential concerns to address:
- The `manageAccount` reorder label is a Clerk internal API surface (lives
  in `node_modules/@clerk/react/dist/chunk-EQJEQXWW.mjs`). If Clerk renames
  or drops the marker in a future major, the dropdown will fall back to
  Clerk's default ordering (Manage account on top) — not broken, just less
  desirable. No type-safety on the string today.

## Progress Update as of 2026-05-28 03:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit on this branch. Adds per-row Public/Private toggle to the
"Are these your current priorities?" rows on profile pages. Owners flip the
slider per row; private rows blur out for non-owner viewers (text + rating
digits illegible, but the highlighted rating-button position stays visible
so visitors can tell *that* a rating exists). Non-owners who click the
slider hit the same Claim-Your-Profile gate the rating buttons use.

### Detail of changes made:
- New sparse table `recommendation_visibility` keyed by
  `(evaluation_id, item_id)`. Row exists only when the priority is private.
  Migration: `drizzle/0021_concerned_payback.sql`.
- New API endpoint `POST /api/recommendations/visibility`. Mirrors the auth
  gate in `/api/recommendations` (eval-owner OR admin). `visibility=private`
  upserts; `visibility=public` deletes the row.
- Server-side filter in `src/app/(authed)/profile/page.tsx`: fetches
  private item IDs in parallel with saved responses, then for non-owner
  non-admin viewers scrubs `text` and `editedText` to `null` on private
  rows before passing to `<Recommendations>`. Rating + category preserved
  so the blurred row still shows which button position was selected.
- `src/components/Recommendations.tsx`: adds an inline `PrivacySlider`
  segmented control under each row's rating buttons. Hidden for non-owner
  viewers of private rows (shown on public rows so non-owners can discover
  the feature; click opens the Claim modal). Adds a `blurred` mode to
  `RatingButtons` and a fixed-width blurred filler string for the priority
  text so the real text never reaches the DOM for non-owners.
- Tests: `tests/app/recommendations-visibility.test.ts` — 9 tests covering
  auth gate (401/403), validation (400 on bad inputs), upsert/idempotency,
  delete on public, admin-can-mutate. Mocks `auth()`, `isEvalOwner`, and
  `isAdmin` so the tests run without standing up real Clerk sessions or
  user-row claims.
- Browser smoke-tested at `http://localhost:3000/profile/founder/wei-deng`:
  unauthenticated render shows 8 sliders (default Public); after toggling
  one priority private via direct DB write, that row renders the blurred
  placeholder + blurred rating digits, the slider is hidden for the
  non-owner, the priority text is absent from the HTML payload, and the
  other 6 sliders render normally. Verified the ScoreDetailButton (which
  serializes the full unfiltered `recommendations` JSON) is gated to
  localhost-or-super-admin, so the text doesn't leak in prod renders.
- Design spec saved to
  `docs/superpowers/specs/2026-05-28-profile-row-privacy-design.md`.
- Queued (not built): improved social card / OG image for profile URL
  unfurls. Captured in `PRD/profile-social-card.md` plus a memory entry.

### Potential concerns to address:
- Pre-existing flakey tests in `tests/app/rescore-all.test.ts` and
  `tests/lib/profiles-scored.test.ts` fail against the dev Neon DB even on
  unmodified `main`. They assert exact row counts / source classifications
  that depend on the DB's current state. Not introduced by this branch but
  worth fixing — the suite shouldn't have count-dependent assertions
  against a shared dev DB.
- `ScoreDetailButton` still receives the unfiltered `recommendations` JSON.
  Safe in practice (gated to localhost + super-admin, both of whom have DB
  access anyway) but if we ever loosen that gate, the gate-aware scrub
  needs to extend to that prop too.
- Custom rows removed via the `✕` button leave orphan rating + visibility
  rows in the DB (pre-existing behavior for ratings; visibility now
  matches). Harmless — no UI surface — but a real "delete custom row"
  endpoint would clean both.
