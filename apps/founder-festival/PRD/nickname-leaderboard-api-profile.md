# nickname-leaderboard-api-profile

## Progress Update as of 2026-06-14 12:06 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR B of the nickname sweep (PR A = chat + emails, #400). Show the member's
nickname wherever a name is displayed on the leaderboard, profile, and the
@mention autocomplete; expose nickname as a separate field in the public API
while keeping `full_name` as the legal name.

### Detail of changes made:
- `src/lib/leaderboard.ts` — `decorateRows` now reads `users.nickname` (high-
  confidence claims only, same gate as avatar/username), builds a
  `claimedNicknameMap`, and sets `nickname` on every `LeaderboardRow`. All three
  row builders (page, event-attendees, search) flow through `decorateRows`, so
  one change covers them. Added `nickname` to the `LeaderboardRow` type.
- `src/components/LeaderboardTable.tsx` — `displayName()` prefers nickname, then
  full name, then the linkedin-handle fallback.
- `src/lib/api/leaderboard-payload.ts` — added `nickname` to `LeaderboardApiRow`
  (and the mapper). `full_name` stays the legal name; clients show
  `nickname ?? full_name`.
- `src/lib/api/score-payload.ts` — `fetchScorePayload` reads `users.nickname`
  from the high-confidence claim, passes it through; added `nickname` to
  `ScorePayloadInput` and to the emitted payload.
- `src/app/(authed)/profile/page.tsx` — Avatar fallback name prefers nickname
  (the heading already showed "Welcome, {nickname}" with the legal name as a
  subtitle).
- `src/components/admin/rich-text-mention.tsx` — the @mention autocomplete
  dropdown now labels suggestions with `nickname ?? fullName` (the search API
  returns full `LeaderboardRow`s, which now include nickname). This closes the
  PR-A follow-up so newly-typed mentions also show the nickname live.
- Tests: added a nickname assertion in `leaderboard-payload.test.ts`; updated
  fixtures in `leaderboard-payload`, `score-payload`, `api-leaderboard-page`,
  `api-leaderboard-search` to include the new `nickname` field.

### Decisions / Potential concerns:
- **Admin pages intentionally still show the legal full name** (sponsors,
  pending, events, badges, profiles). These are internal moderation/identity
  tools where the legal name is the right thing to show. Flagged for the user to
  confirm — easy to switch to nickname if they want.
- **Public API `full_name` is unchanged** (legal name) per the user's explicit
  call; `nickname` is the new sibling field consumers should prefer for display.
- Local `pnpm vitest` surfaces failures from stale `.claude/worktrees/*` copies
  of unrelated branches; those aren't in CI. This checkout's tests pass (23/23
  for the touched files).
