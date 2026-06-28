# Branch: `pill-edit-and-grayscale` — progress log

Branched from `main` (post PR #27). Adds owner-editable achievement
badges with grayscale-until-confirmed default + a pending review flow.

## Progress Update as of 2026-05-25 5:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
- **New `badge_overrides` table** captures per-(eval, badge_id) owner
  actions. Migration applied to both dev + prod Neon branches.
- **`computeBadges()`** now takes an optional overrides arg and returns
  pills with a `status: "likely" | "confirmed" | "pending" | "rejected"`
  field. The status drives all visual + interactive behavior downstream.
- **Read paths** (`/profile` + `/leaderboard`) fetch overrides and pass
  them to `computeBadges`. Leaderboard pulls overrides for every row on
  the page in one batched query.
- **Pill rendering**:
  - `"likely"` (default, AI-inferred, untouched) → grayscale border + dim text
  - `"confirmed"` → full category color
  - `"pending"` → gold border + "(Pending)" suffix (mirrors ScoreTable's
    pending pill style)
  - `"rejected"` → hidden
- **Owner UI** on `/profile`:
  - Hover any pill → ✓ confirm / ✏ edit / ✗ reject buttons appear
  - Edit only shows for tiered pills (raised, employees, deployed, exits,
    mm). Opens a popover with the full tier list — click to pick a new
    bucket. Save flips the pill to `status='pending'`.
  - A dashed `+` pill at the end of the row opens an "add" picker
    grouped by category. Selecting a pill creates a row with
    `status='pending'`. Tiered pills get a sub-popover for picking the
    initial bucket.
- **Admin** (`isAdmin()`) sees the same UI on any profile, not just
  their own.
- **API**: new `POST /api/badges` with `action: "confirm" | "reject" |
  "edit" | "add"`. Mirrors `/api/score-items/[id]` authorization rules
  — owner can do confirm/reject on likely + edit/add (→ pending). Only
  admin can resolve a pending row.
- **`BADGE_CATALOG`** in `src/lib/badges.ts` is the single source of
  truth for which pill ids exist, what category they belong to, and
  (for tiered pills) the full option list. Drives the add picker, the
  edit popover, and the fallback render path for owner-added pills
  the AI didn't infer.

### Operator follow-up:
- Admin pending queue (`/admin/pending`) does NOT yet include pending
  badge overrides — only score-items. Next branch should add a "Pending
  pill edits" section using the same shape as the score-items list.
- Vanity profile URLs (`/profile/<username>`,
  `/profile/<kind>/<name-slug>`) — the user asked for these in the same
  message that triggered this work. Coming on a separate branch.

### Potential concerns:
- The `+` add picker shows every pill in the catalog that's not already
  on the row. No relevance filter — e.g., an investor could "add" an
  IPO badge with no founding history. Admin review is the safety net.
- Edit popover positioning uses `position: absolute` relative to the
  pill — if the pill is near the right edge of the container, the
  popover can clip. Workable for v1; can switch to floating-ui later.
