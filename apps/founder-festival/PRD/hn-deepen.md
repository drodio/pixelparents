## Progress Update as of 2026-06-05 04:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Foundation for the "go deep on Hacker News via the Algolia API" initiative:
fixed HN identity resolution so the HN + HN-Tokenmaxxing signals actually get
captured. Previously both only fired when Exa had surfaced the subject's
`news.ycombinator.com/user?id=` URL, so they missed Sam Rivera (#1 on the
Tokenmaxxing board) and DROdio despite both being listed on tkmx.

### Detail of changes made:
- `src/lib/enrichers/hackernews.ts`: extracted a shared `resolveHnHandle(ctx,
  knownHnUrls)` with three tiers — (1) Exa HN URL, (2) name-derived candidate
  whose bio corroborates, (3) **content discovery**: search HN for stories
  linking the subject's own domains (from `ctx.searchHighlights`, minus a
  big-platform denylist), take the most-frequent author whose HN bio corroborates
  the subject. Returns the EXACT-case handle (HN usernames are case-sensitive +
  arbitrary, e.g. "Sam_Rivera"). New exported helpers `registrableDomain`,
  `subjectDomainsFromHighlights`. The enricher's rich facts (top posts by points,
  bio, counts) already existed and are unchanged.
- `src/lib/enrichers/hn-tokenmaxxing.ts`: now calls `resolveHnHandle` instead of
  only reading Exa URLs, so it captures anyone the HN enricher can identify.
- Verified live: with NO Exa HN URL, `resolveHnHandle` discovers `Sam_Rivera` via
  content (karma 4506). tsc clean; helper unit tests pass.
- Doc → v0.0.8a changelog note (capture fix, no point changes).

### Coordination (multi-agent):
- A separate agent owns the leaderboard sidebar **badge UI + click-to-filter +
  per-badge counts** (`leaderboard-badge-filters`, not yet branched).
- This worktree (`hn-deepen`) owns scoring/HN + the **industry data layer** (the
  canonical industry taxonomy + founder-industry derivation that will feed their
  badges) + the profile Industries section. I am holding anything that touches
  `Badges.tsx` / the leaderboard sidebar to avoid collisions.
- My open **PR #178** (leaderboard subtitle/badges/table-fixed) touches
  `Badges.tsx` + `leaderboard.ts` — should merge before their sidebar restructure.

### Potential concerns to address:
- Content discovery does up to ~4 Algolia searches + a few `/users` fetches per
  eval (best-effort, parallel, null on miss). Both HN and Tokenmaxxing now resolve
  independently (duplicate calls, but parallel) — could share one resolution if
  latency matters.
- Not yet shipped to prod; will open a PR for visibility and commit often.
