# Leaderboard coordination

Two agents work on the leaderboard in parallel. This file is the durable
contract between them — **read it before editing any leaderboard file**, and
update it when ownership or the interface changes.

## Ownership

### Leaderboard UI agent (branch: `leaderboard-badge-filters`)
Owns the generic leaderboard UI + filter machinery:
- The active-filter **pills row** (`LeaderboardActiveFilters.tsx`) — white,
  removable pills under the search box; hidden when no filters are active.
- The **sidebar** (`LeaderboardFilters.tsx`) — Role / Stage / Capital / Team +
  the full **Badges list with per-badge counts**, sorted by count desc. (No
  "Filters" heading, no "Clear all", no "Outcome" facet — folded into badges.)
- **Click-to-filter**: clicking a badge on a row toggles it as a filter. Built
  on the shared `Badges` `onBadgeClick(id)` + `filterableBadgeIds` props.
- The **fixed badge taxonomy** + its predicates (`leaderboard-badge-sql.ts`)
  and per-badge counts (`getBadgeCounts()` in `leaderboard.ts`).
- The `Badges.tsx` "fit" measurement (fill row → "+N more").
- Search behavior (`searchLeaderboard` tokenization).

### Industry / scoring agent (branch: `hn-deepen`, and scoring PRs)
Owns everything industry + the HN enricher + scoring:
- The **industry data layer**: a canonical industry taxonomy (~30–50 slugs) +
  normalizer that both investor-derived (`investor_industry_focus`) and
  founder-derived industries map into.
- The **`industry` filter param** + its SQL predicate.
- Founder-industry derivation; the profile Industries section.
- HN deep enricher; scoring recalibration.

## Industry interface contract (to be filled in by the industry agent)

The UI agent's click-to-filter, sidebar counts, and pills are built against a
generic `(paramKey, value, label)` model, so industry plugs in with **no UI
rework** once the data layer lands. What the UI side needs:

1. A **queryable normalized industry field** on the evaluation row — ideally a
   `text[]` column of canonical industry slugs — cheap for `= ANY(...)`
   predicates and `unnest()` counts.
2. The **canonical taxonomy** (slug → display label).
3. The `industry=<canonical-slug>` URL param (CSV for multi-select) + its
   predicate.

With (1)+(2), the UI agent adds: an `industry` count to `getBadgeCounts` (or a
sibling), industry rows in the sidebar list, industry pills, and industry-badge
click-to-filter. Until then, industry badges render **non-clickable** and are
**not** listed in the sidebar (no interim free-text filtering — nothing to rip
out later).

> **Industry agent: replace this note with the concrete column name, taxonomy
> location, and param shape once built.**

## Status markers (founder / investor)

The leaderboard renders a founder + investor status marker next to the Founder /
Investor score numbers (desktop cells + mobile cards), reusing the **shared
`StatusMarker({role, status})`** from `FounderStatusMarker.tsx` (the scoring
agent's) — same look + hover tooltip as the profile. ✓ current (green), ✱ past
(gold) / never (darker red).

- Both statuses are the real **LLM-classified `evaluations.founder_status` /
  `investor_status` columns** (the scoring agent owns classification + backfill).
  The leaderboard just selects them into `LeaderboardRow` and renders the marker.
- The `StatusMarker` `never` color was darkened (`text-red-500` → `text-red-700`)
  per a product request — shared with the profile.
- Founder/Investor columns were widened `w-20` → `w-24` so the number + marker
  fit without reintroducing horizontal overflow.

## Cross-surface tweaks by the leaderboard agent (heads-up)

Small presentational fixes the leaderboard agent made in the scoring agent's
files (per direct product requests) — flagged here so we don't collide:
- `FounderStatusMarker.tsx`: `never` color darkened `text-red-500` → `text-red-700`.
- `profile/page.tsx`: the Founder/Investor score number spans got `whitespace-nowrap`
  so the `StatusMarker` stays inline to the RIGHT of the number (it was wrapping
  below for wide numbers like "77,906").
- `EvalProgress.tsx`:
  - Founder/Investor/Total score numbers are gold (`text-[#dfa43a]`).
  - Step rows (green-check rows) are WHITE (`text-zinc-300`/`text-white`); only
    the revealed sub-bullet findings are gold.
  - `scrollIntoView` uses `block:"nearest"` (was `"center"`) so the list fills
    top-to-bottom without the viewport bouncing.
  - "Computing your score" was REMOVED from `EVAL_STEPS` and is now a gold
    left-to-right **progress bar** at the top of the sticky scoreboard header
    (fills over ~20s once the research steps are checked; capped 92%; navigation
    may happen before it's full). The bottom "Finalizing your profile…" spinner
    was removed (the bar replaces it).

## Conventions
- Deploy = PR merge to `main`. Prod migrations are manual (separate Neon DBs).
- Keep `BADGE_SQL_PREDICATES` (server) and `BADGE_FILTER_LABELS` /
  `FILTERABLE_BADGE_IDS` (client, in `leaderboard-constants.ts`) in sync — a
  test asserts this.
