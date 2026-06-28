# Branch: `badge-hover-pushes-neighbors` — progress log

Branched from `main` (post PR #32).

## Progress Update as of 2026-05-25 6:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Refinement from QA: instead of overlaying the action buttons on top
of the next badge, the next badge should slide over to make room.
Switched the action span back from `position: absolute` to inline
flow, but with `display: none → inline-flex` on hover (instead of
the opacity-toggle from before).

Net behavior:
- Idle: action group is `display: none`, occupies zero layout width →
  badges sit tight.
- Hover: action group becomes `inline-flex`, the parent flex-wrap row
  recalculates, and the badge to the right slides over to make room.
- Compared to the earlier opacity-0 approach this still has zero
  default footprint; compared to the absolute-positioned popover this
  preserves the flow so nothing overlaps.

### Detail of changes made:
- `src/components/Badges.tsx` `EditablePill` action span:
  - was: `absolute left-full top-1/2 -translate-y-1/2 ml-1 hidden
    group-hover/pill:flex focus-within:flex ... rounded-md
    bg-zinc-900/95 border border-zinc-700 px-1 py-0.5 shadow-md`
  - now: `ml-1 hidden group-hover/pill:inline-flex
    focus-within:inline-flex items-center gap-0.5`
  - Dropped the dark popover backdrop (no longer needed since
    actions sit inline, not overlaid).
