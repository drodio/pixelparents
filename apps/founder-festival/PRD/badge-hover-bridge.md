# Branch: `badge-hover-bridge` — progress log

Branched from `main` (post PR #35).

## Progress Update as of 2026-05-25 7:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA bug from PR #35: the action popover floats above the pill with a
4-6px visual gap (so it reads as a separate element, not glued to
the pill). The cursor moving from the pill UP to the popover crossed
that gap → lost hover on `group/pill` → popover hid mid-flight.

Fix: split the popover into two nested spans:
- **Outer span** (the hit-area): absolute-positioned with `pb-1.5`
  padding-bottom. Transparent. Bridges the visual gap so the cursor
  has a continuous hit zone from the pill to the popover.
- **Inner span** (the actual popover): has the dark backdrop +
  border + padding + shadow.

Net behavior: visually the popover still floats above the pill with
a clean gap. Cursor-wise the hit area extends down to the pill, so
the hover state never drops as the user travels up to click an icon.

### Detail of changes made:
- `src/components/Badges.tsx` `EditablePill` action group:
  - Outer wrapper: `absolute left-1/2 bottom-full -translate-x-1/2
    pb-1.5 hidden group-hover/pill:block focus-within:block z-20`
  - Inner popover: `inline-flex items-center gap-0.5 rounded-md
    bg-zinc-900/95 border border-zinc-700 px-1 py-0.5 shadow-md
    whitespace-nowrap`
  - Three buttons live inside the inner span unchanged.
