## Progress Update as of [June 30, 2026 — 9:57 PM Pacific]

### Summary of changes since last update
First entry for `feat/qa-community`. Fixed all 12 verified user-facing QA
findings for the Community exchange, response threads, and polls (from the
qa-community QA pass). Every finding was confirmed against the code before
fixing. Scope stayed strictly within the owned files:
`app/(authed)/community/**`, `lib/exchange.ts`, `lib/db/asks.ts`,
`lib/db/exchange-thread.ts`. tsc + lint + all 802 tests pass. `next build` was
NOT run in the worktree (per instructions).

### Detail of changes made:
- **#1 (high) — matched posts vanished from the board.** `lib/exchange.ts`:
  added `"matched"` to `StatusFilter` and gave it its own filter bucket (was
  falling through to only `"all"`). `exchange-board-client.tsx`: added a
  **Matched** status tab + a sky "Matched" badge on the card (not dimmed — still
  an active connection). The board already fetches `listAllAsks()` (matched is in
  the dataset), so no DB change needed.
- **#2 (high) — polls invisible to non-parties despite "public voting" copy.**
  The response card returns null for non-parties, so their polls never rendered.
  Backend `votePollAction` already allows ANY verified caller to vote (party gate
  is only on close), so intended design is public voting. Added an exported
  `PublicPollList` in `response-thread.tsx` and, in `[id]/page.tsx`, gathered
  every poll from responses the viewer is NOT a party to (polls are always public
  by construction — `addPoll`) into a standalone "Community polls" section. No
  private response content leaks. The composer + footer copy are now truthful.
- **#3 (high) — all-day event proposal off-by-one.** `formatEventWhen` in
  `response-thread.tsx` now formats the all-day branch with `timeZone:"UTC"`
  (mirrors `events/event-bits.tsx`), fixing the west-of-UTC one-day-earlier drift.
- **#4 (medium) — expired-but-open posts still accepted responses.** `[id]/page.tsx`
  now gates the form on `acceptingResponses = open && !expired` and shows an
  "expired" notice. `actions.ts respondToAskAction` now rejects expired posts
  server-side with "This post is no longer accepting responses."
- **#5 (medium) — third party on matched/resolved post got a silent dead-end.**
  Added an explicit notice branch (expired / matched / resolved) for non-author
  viewers who haven't responded when the post isn't accepting responses.
- **#6 (medium) — declined responders still saw the green "will let you know"
  banner.** `[id]/page.tsx` now reads the viewer's OWN response status
  (`viewerResponseStatus`): declined → neutral "wasn't taken up"; accepted →
  "you're connected"; offered → the original reassuring banner.
- **#7 (medium) — online proposal hid the meeting link.** `response-thread.tsx`
  fixed the identical-branch `"Online"`/`"Online"` ternary to render the
  `onlineUrl` as a safe clickable link (`target=_blank rel=noopener nofollow`).
- **#8 (medium) — no delete for own poll / event proposal.** Added an author-only
  (`message.isOwn`) trash control to `PollCard` and `EventProposalCard`, reusing
  the existing `deleteResponseMessageAction`.
- **#9 (medium) — "Connect with X" fell through to a blank generic form.**
  `new/page.tsx` now detects a supplied-but-unresolvable `connect` param
  (`connectUnavailable`) and renders an explicit notice with a directory link.
- **#10 (medium) — "Pick what you'd like to connect about" shown with no chips.**
  `new/page.tsx` header copy is now conditional on `connect.topics.length`.
- **#11 (low) — poll vote had no optimistic feedback.** Added pure
  `applyOptimisticVote` (+ `PollTally` type) in `lib/exchange.ts`; `PollCard` now
  reflects the toggle instantly (counts/bar/checkmark), shows a pulsing clock on
  the tapped option, reconciles on server refresh, and rolls back on error.
- **#12 (low) — 9th+ topic chip selected but silently dropped the tag.**
  `post-form.tsx onToggleTopic` now blocks selecting a NEW topic once
  `ASK_TAGS_MAX` tags exist and surfaces a "tag up to N" hint (selection stays in
  sync with applied tags).

### Tests
- `lib/exchange.test.ts`: added matched-bucket filter tests (open hides matched;
  matched shows only matched; all includes matched) and a full `applyOptimisticVote`
  suite (add/retract/move/out-of-range/immutability/no-negative).
- Full run: 69 files, 802 tests passing. tsc + eslint clean.

### Potential concerns to address:
- `next build` was intentionally NOT run in this worktree (per instructions);
  CI/Vercel should be the build gate.
- Finding #2 surfaces polls at the post level for non-parties. The design intent
  (option a) was chosen over rewording to party-only. If product later decides
  polls should be party-only, the `PublicPollList` render + the "public voting"
  copy would both revert together.
- The non-party ResponseThread `!viewerIsParty` branch (the public-thread footer)
  is now effectively unreachable since non-party response cards don't render;
  its copy is accurate but the branch is dead. Left in place — out of scope to
  remove and harmless.
