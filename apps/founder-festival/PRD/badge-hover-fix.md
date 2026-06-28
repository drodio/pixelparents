# Branch: `badge-hover-fix` — progress log

Branched from `main` (post PR #31 hotfix).

## Progress Update as of 2026-05-25 6:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA report: badges on /profile were spread out horizontally — looked
like they had extra gaps between them. Cause: the per-pill hover
action group (✓ ✏ ✗) was always in the DOM with `opacity-0`, so it
took layout space even when invisible. Each pill effectively
reserved width for its hidden actions, pushing neighbors apart.

Fix: switched the action group to `position: absolute` so it overlays
neighbors on hover instead of pushing layout. When not hovered the
actions are `display: none` (not just transparent), so they take zero
space. When hovered they pop up to the right of the pill on a dark
background.

### Detail of changes made:
- `src/components/Badges.tsx` — `EditablePill` action span:
  - was: `ml-1 inline-flex ... opacity-0 group-hover/pill:opacity-100`
  - now: `absolute left-full top-1/2 -translate-y-1/2 ml-1 hidden
    group-hover/pill:flex focus-within:flex ... z-20 rounded-md
    bg-zinc-900/95 border border-zinc-700 px-1 py-0.5 shadow-md`
  - The dark background ensures the icons stay readable when they
    overlay a colored neighbor.

### Verified on dev:
- /profile pills sit tight against each other again with no extra
  horizontal gap.
- Hovering a pill shows ✓ ✏ ✗ floating in a small popover bar to
  the right.
- `pnpm tsc --noEmit` clean.
