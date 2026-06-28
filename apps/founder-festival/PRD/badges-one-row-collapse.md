# badges-one-row-collapse

## Progress Update as of 2026-06-19 06:14 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev review #57. One valid finding fixed: the hidden measure layers
duplicated interactive content, and in `CollapsibleRow` those duplicates were
real `<a>` links that stayed keyboard-focusable (tab order) despite `aria-hidden`.
Added `inert` to the measure-layer `<div>`s in `CollapsibleRow` and `Badges` so
the duplicated nodes leave the tab order + a11y tree.

### Detail of changes made:
- `src/components/CollapsibleRow.tsx` + `src/components/Badges.tsx` — `inert` on
  the measure-layer divs.
- Declined findings (recorded on the review): 0-width first-paint rAF fallback
  (YAGNI — parent always has definite width here), duplicate-key concern
  (invalid — badge ids are unique), order-preserving fit loop (invalid —
  intentional).

## Progress Update as of 2026-06-19 06:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profile badge groups (Professional / Industries / Personal) are now constrained
to a single row. Overflow collapses into a clickable "+N more" pill that expands
the group inline to show everything (with a "less" to re-collapse). Previously
badge-heavy groups (e.g. Professional) wrapped onto multiple lines.

### Detail of changes made:
- `src/components/use-one-row-fit.ts` (new) — shared hook extracting the
  single-row fit measurement (ResizeObserver + offset math) that previously
  lived inline in `Badges` fit mode. Supports a `leadingCount` so a group label
  can be the first child of the measure layer (its width is respected; pills are
  counted after it). `set-state-in-effect` lint disabled within the effect — it's
  a legitimate measure-DOM-before-paint effect (matches prior behavior).
- `src/components/Badges.tsx` — refactored fit mode to use the hook; added a
  `collapsible` prop. In wrap mode, when `collapsible && !expanded`, renders a
  one-row collapsed view (label + fitting read-only pills + "+N more"). Clicking
  "+N more" sets `expanded`, falling through to the existing full editable wrap,
  which now also shows a "less" button. Edit controls (✓/✏/✗, "+ add") live in
  the expanded state.
- `src/components/CollapsibleRow.tsx` (new) — generic one-row+"+N more" wrapper
  for pill content that isn't a `Badge` (the purple family/Personal pills, which
  use a `?family=` link and purple styling outside the badge catalog). Uses the
  same hook.
- `src/app/(authed)/profile/page.tsx` — added `collapsible` to the Professional
  and Industries `<Badges>`; converted the Personal/family group to render via
  `<CollapsibleRow>` (same purple pills, now collapsing).

### Potential concerns to address:
- No automated test: the fit math depends on real DOM layout (offsetLeft /
  clientWidth), which jsdom doesn't compute, so it isn't unit-testable. The logic
  is a faithful extraction of the leaderboard's already-live fit measurement.
  Verify visually on a profile with many badges (resize the window to confirm the
  "+N more" count adjusts and expand/collapse works).
- Pre-existing lint (not from this change): `Badges.tsx:90` setLocal-in-effect
  and the profile home-logo `<a>`/`<img>` (~616). Lint is informational in CI.
