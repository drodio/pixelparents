## Progress Update as of June 29, 2026 — 9:58 PM Pacific

### Summary of changes since last update
Initial implementation of the GitHub-linked "Builder" tag. A family member's
GitHub username (already editable on the /family member card) can now drive an
automatic "Builder" badge: a commit check counts their commits on the Pixel
Parents repo and, when any are found, auto-marks them a builder. A manual
override is also available. Effective builder status is shown as a badge on the
OHS directory cards and the public /p share page. ALL new state lives in
`signups.extra` jsonb — no new DB columns (a stray `country` column once caused a
prod P0).

### Detail of changes made:
- **State model + pure helper** — `lib/builder.ts` defines `builderStatusOf(extra)`
  → `{ isBuilder, contributions }`. State keys in `extra`: `builder` (bool, auto),
  `builderManual` (bool, manual override), `githubContributions` (int),
  `githubCheckedAt` (iso). Effective builder = `builderManual === true || builder
  === true`. The helper is pure (no DB/network), tolerates missing/garbage values,
  and clamps the count to a non-negative integer. Unit test in `lib/builder.test.ts`
  (covers empty extra, each flag, OR semantics, literal-true-only, count
  coercion/clamping).
- **Commit check** — `lib/github.ts` gains `countUserCommits(username)`. Reuses the
  existing module auth (`GITHUB_ADMIN_TOKEN`) + `GITHUB_REPO` and the
  `validUsername` guard. Calls `GET /repos/{owner}/{repo}/commits?author={u}
  &per_page=100&page=N`, walks up to `MAX_COMMIT_PAGES` (5) pages, stops on a short
  page. Best-effort: NEVER throws — returns 0 (or whatever was counted) on missing
  token/username, 403/404/422, non-array body, or network error.
- **Server actions** — `app/(authed)/family/actions.ts` adds `refreshBuilderStatus
  (targetSignupId)` and `setBuilderManual(targetSignupId, on)`. Both authorize by
  FAMILY MEMBERSHIP via a new private `authorizedTarget()` helper that mirrors
  `patchFamilyMember`: caller derived from `currentUser()`/session (never the
  client), caller's `family_id` resolved via `familyIdForEmail`, and the target row
  loaded with a `WHERE id = target AND family_id = caller's family_id` clause (that
  match IS the authorization — a non-member resolves null). `refreshBuilderStatus`
  reads the target's `githubUsername`, counts commits, and does a read-modify-write
  merge on `extra` (sets `githubContributions` + `githubCheckedAt` always; sets
  `builder = true` ONLY when commits > 0 — a later 0 count never revokes a real
  builder or a manual override). `setBuilderManual` merges `builderManual`. Both
  return the resulting effective `BuilderStatus`.
- **Directory card data** — `lib/directory.ts`: `DirectoryCard` gains
  `isBuilder` + `contributions`, populated in `buildDirectoryCard` via
  `builderStatusOf(row.extra)`. Not gated behind a share field (community
  recognition, not PII). New cases added to `lib/directory.test.ts`.
- **Display** — `app/(authed)/directory/directory-client.tsx` renders a "Builder"
  badge (with "· N contributions" when known) under the card name using
  `IconCode`. `app/p/[token]/page.tsx` derives `builderStatusOf(signup.extra)` and
  renders the same badge under the name/location.
- **Family UI** — `app/(authed)/family/member-card.tsx` adds a "Builder status"
  block under the GitHub username field: an IconCode/IconSparkles header + Builder
  pill, a "Check GitHub contributions" button (→ `refreshBuilderStatus`, disabled
  with a hint when no username is set), the contribution count, and a "Mark as a
  Builder manually" checkbox (→ `setBuilderManual`, optimistic with revert). No
  emoji; icons from `components/icons.tsx`.

### Validation
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm test` — 18 files, 187 tests pass (includes new builder + directory cases).
- `npm run build` — succeeds.

### Potential concerns to address:
- The commit check depends on `GITHUB_ADMIN_TOKEN` + a public/accessible
  `GITHUB_REPO`. With no token or a private repo the count is 0 (the button still
  works, just finds nothing) — this is intentional best-effort behavior, but means
  the auto tag is a no-op in environments without the PAT.
- GitHub's `commits?author=` matches by the *linked GitHub account*, not by commit
  email — a contributor whose commits aren't associated with their GitHub username
  won't be counted. The manual toggle is the escape hatch for that case.
- `MAX_COMMIT_PAGES = 5` caps the count at ~500 commits; prolific contributors
  would show the cap, not the true total. Raise the cap if exact totals matter.
- No rate-limit backoff: a burst of "Check" clicks could hit GitHub's secondary
  rate limit; the action fails soft (count stays as last good value) but a debounce
  / cooldown on the button could be added if it becomes an issue.
- `githubCheckedAt` is stored but not yet surfaced in the UI; a "last checked"
  hint could be added later.
