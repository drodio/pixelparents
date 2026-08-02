# feat/ava-feedback-batch-2

**Stacked on `feat/ava-feedback-batch-1` (PR #191), NOT on `main`.** Batch 1 adds
the `signups.wechat_id` column that this branch reads, so #191 must merge first.
If #191 is rebased or squashed, rebase this branch onto the new tip before
merging (`git rebase --onto main <batch-1-tip> feat/ava-feedback-batch-2`).

Continues from `PRD/feat-ava-feedback-batch-1.md` — read that first for the
source-of-truth doc, the full item list, and the "already shipped, do NOT
rebuild" section.

## Progress Update as of [July 31, 2026 — 9:35 PM Pacific]

### Summary of changes since last update

Built the last clearly-specified item from Ava's doc: a reply in a community
thread can now link an existing resource board without leaving the page. All four
`verify` steps (typecheck, lint, test, **build**) run green locally.

### Detail of changes made:

- **"Link a resource board" in the reply composer.** Ava's framing: someone asks
  a question a board already answers, and whoever replies should be able to point
  at it.
  - Key realization that kept this small: replies **already** linkify bare
    http(s) URLs (`lib/linkify.tsx`), so this needed no new message kind, no
    schema change, and no new rendering path. The only missing piece was *finding*
    the board. Contrast with the `@mention` system, which needed markers,
    serialization, and re-resolution because it stores identity.
  - `app/(authed)/community/actions.ts`: new `searchResourceBoardsAction`.
    Same `verifiedCaller()` gate as `searchMentionMembersAction`. Returns only
    `{id, title}`, both already visible to any verified member on `/resources`,
    so it exposes nothing new. An empty query lists recent boards so someone who
    doesn't know what they want still sees options.
  - `app/(authed)/community/[id]/board-link-picker.tsx`: new client component.
    Debounced (180ms) search, outside-click + Escape to dismiss, keyboard-
    reachable, `role="listbox"`.
  - `app/(authed)/community/[id]/response-thread.tsx`: renders the picker under
    the reply textarea. On pick it appends `"<title> — <origin>/resources/<id>"`
    to the body, clamped to `REPLY_BODY_MAX`. The URL is absolute on purpose —
    `Linkify` deliberately ignores relative paths, so a relative link would
    render as dead text.
  - The parent owns the body state; the picker never touches the textarea.

### Verification run

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0 (first pass FAILED on
  `react-hooks/set-state-in-effect`: `setLoading(true)` sat in the effect body;
  moved inside the debounce timeout)
- `npm test` — exit 0, 874/874
- `npm run build` — exit 0

Checked by exit code, not by eyeballing output — an earlier run in this session
printed a misleading "LINT OK" because `&&` chained off `tail` rather than off
`npm`.

### Potential concerns to address:

- **The picker is not live-verified.** Community threads are behind auth AND
  require an existing ask with a response, so it couldn't be exercised locally.
  It typechecks, lints, builds, and mirrors the existing mention-picker patterns,
  but a signed-in pass is genuinely needed before trusting it.
- `searchResourceBoardsAction` filters in JS over `listBoards(limit: 200)` rather
  than querying with a SQL `ILIKE`. Fine at current board counts and it reuses the
  audited visibility path, but it will not scale past a few hundred boards.
- Inserted text is plain — there's no board *card* in the rendered reply, just a
  linkified URL with the title beside it. That was the deliberate small-scope
  choice; a richer embed would need a real message kind.
- The picker attaches only to the plain comment/private-note composer, not to the
  event-proposal or poll modes (they have their own field sets). That seems right
  but is worth confirming with Ava.

## Progress Update as of [July 31, 2026 — 8:37 PM Pacific]

### Summary of changes since last update

Closed the biggest gap batch 1 left behind — WeChat was write-only, saving to the
DB but displaying nowhere — and fixed the React hydration mismatch flagged as a
concern in batch 1. Typecheck + lint clean, 874/874 tests pass, both fixes
verified in a real browser.

### Detail of changes made:

- **WeChat is now readable, not just writable.** Batch 1 added the column, the
  signup field, and the sanitizer, but nothing rendered it, so from a user's
  point of view the data vanished.
  - `components/profile-view.tsx`: renders in the **Contact** block next to
    phone/email, behind the same `visible.has("phone")` share opt-in — it's a
    direct-contact channel, so it inherits the contact gate rather than the
    professional-links one.
  - Deliberately suppressed when `usingParentContact` is true. That path exists
    to withhold an un-certified minor's own reachability, so it fails closed.
    Students can't set a WeChat ID today anyway (the signup field is parent-only),
    which makes this belt-and-braces rather than load-bearing — but it stays
    correct if the field is ever opened up to students.
  - `app/(authed)/family/member-card.tsx`: editable after signup. The card's
    `set()` helper auto-queues by key into `patchFamilyMember` → the same
    `sanitizeSignupPatch` batch 1 added, so no extra server wiring was needed.
  - `components/icons.tsx`: new `IconMessage` (speech bubble), matching the
    existing stroke-icon style.
- **Fixed the hydration mismatch** logged on the landing AND signup pages
  (raised as a concern in batch 1, confirmed pre-existing, not caused by it).
  - `app/signup/interest-tiles.tsx` positioned all 60 tiles with
    `style={{ left: c.x, top: c.y, width: 134 }}` where `c.x`/`c.y` are raw
    Voronoi floats (e.g. `611.610851749219`). React's server renderer rounds
    those into the style attribute (`"611.611px"`) while the client keeps full
    precision, so *every tile* logged a mismatch.
  - Now emits explicit fixed-precision px strings
    (`${c.x.toFixed(2)}px`), so both sides serialize identically.

### Verification run

- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 72 files, 874 tests passing.
- Browser: landing + signup both render **zero console errors** (previously four
  hydration errors across the two). Confirmed tiles emit
  `left:145.05px;top:32.43px;width:134px`.
- NOT exercised live: the WeChat profile row and the family-card editor are both
  behind auth. They typecheck and follow the existing gate patterns, but want an
  eyeball with a signed-in account.

### Still open (unchanged from batch 1 unless noted)

- **"Open event" — investigated, no defect found.** Checked the three plausible
  causes and all are sound: `/events/[id]/page.tsx` exists; its guards are just
  a UUID regex, the shared events gate, and a null-row check; and the `Overlay`
  stacks the panel (`relative z-10`) above the backdrop button, so the link isn't
  being swallowed. The `DayEventPill` `stopPropagation` only affects the pill,
  not the overlay link. **Needs a real repro** (signed-in, on a specific event)
  before anything is changed — do not "fix" this blind.
- Resource-board links in community replies.
- Devina's hierarchical interest tags (`book → fantasy → title`).
- Daily digest notifications, global search, relevance-ranked directory.
- Sofia's feedback batch (her doc tab is still empty).
- Light mode + OHS color scheme — explicitly deferred by Ansh.

### Potential concerns to address:

- **WeChat share-gate choice is a judgement call.** It rides the `phone` opt-in.
  A parent who shares email but not phone will not expose WeChat. That seemed
  like the safer default, but if parents expect WeChat to be as public as
  LinkedIn it belongs on the `links` opt-in instead. Worth confirming with Ava.
- WeChat still doesn't appear on the **directory card** or in **admin edit**
  (`app/(authed)/admin/parents/[id]/edit/edit-form.tsx`), only on the profile and
  the family card. That's probably right — the card is a dense grid — but admin
  can't correct a typo'd WeChat ID today.
- The no-JS `formData` signup path still omits `wechatId` (carried over from
  batch 1; it also omits `websiteUrl`/`enrichmentOptIn`, so it's consistent).
- `interest-tiles.tsx` lives under `app/signup/` but is imported by `app/page.tsx`
  and `app/builders/page.tsx` too. Fine, but the location is misleading — it's a
  shared component sitting in a route folder.
