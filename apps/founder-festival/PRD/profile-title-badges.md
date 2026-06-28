## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Added an LLM-generated one-sentence credibility title shown above the profile badges, and restructured the badges into three labeled, left-justified bullet groups (Professional / Industries / Personal). Title generates on scoring; migration 0047 adds the column (applied to DEV; prod GATED).

### Detail of changes made:
- DB: `evaluations.credibility_title` text column (migration `0047_groovy_lockjaw.sql`, applied to DEV only).
- `src/lib/scoring-schema.ts`: `credibilityTitle: string|null` output field. `src/lib/scoring-rubric.ts`: new CREDIBILITY TITLE section (one punchy sentence; no points/scores). `src/lib/eval-pipeline.ts`: persists `credibilityTitle` in both payload paths; `reEvaluate` preserves it on empty (like industries).
- `src/components/Badges.tsx`: new `label`, `align` ("left"), `bulleted` props; wrap mode renders a gray group label + left-justified bullet pills.
- `src/app/(authed)/profile/page.tsx`: split badges into `professionalBadges` (non-industry) + `industryBadges`; render the title, then Professional / Industries / Personal groups as labeled left-justified bullets.

### Potential concerns to address:
- Prod migration 0047 still needed before the title persists in prod. One re-score of a profile then generates its title (and, with the earlier fix, restores its industries + keeps follower points).
- Title is null until a profile is re-scored; the line simply doesn't render until then.
