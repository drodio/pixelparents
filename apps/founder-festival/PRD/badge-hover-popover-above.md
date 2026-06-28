# Branch: `badge-hover-popover-above` — progress log

Branched from `main` (post PR #34).

## Progress Update as of 2026-05-25 7:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA bug from PR #33: when the LAST badge in a row got hovered, the
inline ✓/✏/✗ action group expanded its width, which pushed the badge
to the next row. The cursor was no longer over the (now-moved) badge,
so the hover state dropped, the action group collapsed, and the pill
popped BACK up — creating a flicker loop that made the actions
unreachable.

Fix: action group now floats ABOVE the pill as an absolute-positioned
popover instead of being inline. The pill stays in its original
position, neighbors don't move, and there's no wrap-induced cursor
escape. The popover is a SIBLING inside the same `group/pill`
wrapper, so moving the cursor between pill and popover keeps the
group hovered (no gap because the popover sits flush above with
`mb-1`).

### Detail of changes made:
- `src/components/Badges.tsx` `EditablePill` action span:
  - was: `ml-1 hidden group-hover/pill:inline-flex
    focus-within:inline-flex items-center gap-0.5`
  - now: `absolute left-1/2 bottom-full -translate-x-1/2 mb-1
    hidden group-hover/pill:flex focus-within:flex items-center
    gap-0.5 z-20 rounded-md bg-zinc-900/95 border border-zinc-700
    px-1 py-0.5 shadow-md whitespace-nowrap`
  - Dark backdrop ensures icons stay legible regardless of what's
    behind them.

### Verified on dev:
- Badges sit tight against each other (zero layout footprint).
- Hovering ANY badge — including the last one on a row — pops the
  action group up above the pill without moving the pill.
- Cursor can travel from pill → popover without losing hover.
- `pnpm tsc --noEmit` clean.
