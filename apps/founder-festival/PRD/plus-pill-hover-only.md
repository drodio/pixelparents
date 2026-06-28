# Branch: `plus-pill-hover-only` — progress log

Branched from `main` (post PR #37).

## Progress Update as of 2026-05-26 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The two "+ add" affordances now only appear on hover so they don't
distract from the main pill / score-item content at rest:
- **Badges row** (`/profile`): the dashed `+` pill at the end of
  the row only shows when the cursor is anywhere in the badge row,
  or when the add-picker is already open.
- **Score rubric rows** (`/profile`): the trailing `+` circle in
  each rubric (founder + investor) only shows when the cursor is
  anywhere in that rubric, or when the inline add form is open.

### Detail of changes made:
- `src/components/Badges.tsx`:
  - Wrapped the badges row in `group/badges`.
  - The "+" pill's container is `opacity-0
    group-hover/badges:opacity-100 focus-within:opacity-100
    transition-opacity` — except when `pickerOpen`, in which case
    no opacity class is applied so it stays visible while the
    user interacts with the picker.
- `src/components/ScoreTable.tsx`:
  - Wrapped each `Section` (founder + investor) in `group/rubric`
    so the two rubrics have independent hover scopes.
  - `AddItemRow`'s default-state `<li>` is `opacity-0
    group-hover/rubric:opacity-100 focus-within:opacity-100
    transition-opacity`. While `editing=true` (the form is open)
    the li renders without the opacity gate so the user can
    interact normally.
