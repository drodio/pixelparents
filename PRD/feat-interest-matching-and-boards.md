# feat/interest-matching-and-boards

Remaining November 9 walkthrough items that need no product decision:
interest grouping and near-duplicates, the side-by-side picker layout,
related suggestions while typing, related-interest matching, and explaining
resource boards.

## Progress Update as of [November 12, 2026 — late evening Pacific]

### Summary of changes since last update

Browser-tested everything in both themes and at phone width; raised the
contrast of the new small helper text after measuring it.

### Detail of changes made:

- **Contrast:** the category headings, the "Related" label, the "· N people"
  count, the empty-selection line, the board's contribution hint and the
  dashboard's "Similar to" line used 40–45% white, which measured 4.43–4.47:1
  in dark mode (just under the 4.5:1 AA minimum for small text). Raised to
  55%; re-measured 6.25:1 dark / 5.91–6.09:1 light.

### Browser test (local dev server, Chrome, local-only harness with stubbed
### data, never committed)

- Picker: categories render in order with "Other interests" last, Dispersed
  Camping and Hiking now sit together under Outdoors & nature; Explore left /
  Your selected interests right with a live count; on a 390px viewport the
  selected list comes first and nothing scrolls sideways.
- Typing "cycling" shows 'Related to "cycling":' Biking · 3 people and
  Mountain biking · 1 person (dashed), plus "+ cycling"; picking Biking
  selects it and clears the box.
- Entering "Books: harry potter" selects the existing "Book: Harry Potter"
  (lit in the list, listed on the right), with no duplicate.
- Dashboard: a family sharing Hiking and listing Cycling shows "1 shared" with
  a dashed Cycling chip and "Similar to your Biking"; a family listing only
  "Books: Percy Jackson" shows "1 similar" and "Similar to your Book: Harry
  Potter"; a family with no overlap is left out.
- Boards: the three-step explainer renders; the create form shows the new
  placeholders; a board shows the contribution hint and the new empty state.

### Verification (exit codes, per-stage, not tail-piped)

- `tsc --noEmit` = 0, `next lint` = 0, `vitest run` = 0 with **1113/1113 tests**, production build = 0, all after the contrast change.

## Progress Update as of [November 12, 2026 — evening Pacific]

### Summary of changes since last update

First entry. One shared, pure interest taxonomy (`lib/interest-taxonomy.ts`)
now drives three things: the onboarding picker groups interests under
category headings, typing suggests related interests ("cycling" → Biking),
and the dashboard's interest matches include families with related interests
(Harry Potter ↔ Percy Jackson) as a second-tier signal. "Book: X" and
"Books: X" are now one interest. The picker's full layout puts "Explore"
on the left and "Your selected interests" on the right. Resource boards
explain themselves on the boards page, the create page and each board.

### Detail of changes made:

- **Taxonomy** (`lib/interest-taxonomy.ts`, pure, client-safe): 14 display
  categories plus "Other interests", and 26 narrow themes. Keyword matching
  uses the same word rules as `lib/interest-icons.ts` (substring for phrases,
  whole word for ≤3 letters, word-prefix otherwise), so an interest's icon and
  category agree. Every interest in the walkthrough's screenshot lands in a
  named category (tested).
- **Near-duplicates** (`interestKey` in `lib/interest-split.ts`): the identity
  key now also treats a "Label: Title" prefix as singular/plural-insensitive.
  Used by canonicalization (`lib/interests.ts`), the pool counts, the picker
  and the matcher. Nothing else merges: "Cars"/"Car" and distinct titles stay
  apart (tested). The contract comment in `lib/interests.ts` is updated.
- **Picker** (`TagPicker`, full layout when `labels` is passed, i.e. the
  onboarding interests step):
  - Explore column on the left, "Your selected interests" (with a count and an
    empty-state line) on the right from `sm` up; on a phone the selected list
    comes first so it is never buried under the long list.
  - Not typing: suggestions grouped under category headings.
  - Typing: direct matches, then a "Related:" run of dashed chips from
    `relatedSuggestions` (same theme or same word stem, partial words from 4
    letters), then "create new".
  - Selection/dedup now compares by `interestKey`.
  - The compact layout used by /family and child cards is unchanged apart from
    the key comparison.
- **Related matching** (`rankInterestMatches`): each match carries
  `relatedInterests` (their interest, the viewer's interest it relates to, the
  theme). Families with only related interests now appear. `score` is still
  the exact shared count and is never inflated; sort is shared count, then
  related count, then the existing tiebreaks. The dashboard card shows related
  interests as dashed chips with "Similar to your X", the badge reads
  "N similar" when nothing is shared exactly, and the footer explains the
  ranking.
- **Resource boards**: new `HowBoardsWork` three-step explainer (a board is
  one topic; any verified family adds links, files or notes; upvotes sort,
  the creator pins, following notifies) on /resources and /resources/new.
  The create form's placeholders use the walkthrough's example board
  ("Choosing between OHS and other schools"). The board page explains what a
  contribution can be next to "Add a contribution", and the empty state says
  how to start. Every claim matches existing behavior (verified-only
  contribution, owner-only pin, upvote sort, follow notifications).

### Verification

- `tsc --noEmit` = 0, `next lint` = 0, `vitest run` = 0 with **1113/1113
  tests** (93 files; 13 new in `lib/interest-taxonomy.test.ts`), production
  build = 0.
