## Progress Update as of 2026-06-10 10:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Expanded the public API with newly-shipped anonymous-public data found in the changelog.
Brainstormed + approved; design spec at
`docs/superpowers/specs/2026-06-09-credits-spend-dashboard-design.md` lineage continued
in this branch. No DB migration. Unit tests pass; `next build` clean.

### Detail of changes made:
- **Events** (`src/lib/api/events-payload.ts` + routes):
  - `GET /api/v1/events`: each event now carries `badges: [{name, slug}]`; added a
    `?badge=<slug>,…` filter (OR semantics) via `listPublicEvents(badgeSlugs)`.
  - `GET /api/v1/events/{slug}`: now `getPublicEventDetail` — adds nested `hosts`
    `[{name, blurb, icon_url, url}]`, `sponsors` `[{…logo_url, website_url}]`,
    `photos` `[{url, caption}]` (PUBLIC-tier only), and `recap_html`
    (`learnings_public`, sanitized). NO people rosters / attendee data.
  - New `GET /api/v1/event-badges` — the badge vocabulary (`{badges:[{name,slug}]}`).
  - Pure transforms `toPublicHost/Sponsor/Photo/Badge` (unit-tested).
- **Profiles** (`src/lib/api/score-payload.ts`): added `credibility_title` (the public
  one-sentence headline) and `family_badges` `[{label, filter_key}]`
  (`getPublicFamilyBadges`).
- **Leaderboard**: the `?family=` filter (children/spouse/partner/dog/cat/pet) already
  worked via `parseLeaderboardFilter` — documented only, no code change.
- **Docs**: agent guide updated for all of the above + corrected stale `points` mentions
  (the API removed per-row point values). Extended events/score/agent-guide unit tests.

### Potential concerns to address:
- Deliberately excluded (people/member-gated): attendee + host/sponsor people rosters,
  event analytics, public-visibility event answers, member endorsements.
- Known local test flakiness (eval-pipeline / hn-tokenmaxxing) is pre-existing and
  excluded in CI.
