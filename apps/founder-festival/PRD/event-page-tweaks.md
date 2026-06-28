# PRD — event-page-tweaks

## Progress Update as of 2026-06-06 10:54 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Two event-page tweaks: (1) when a cohort is single-dimension
(founders-only or investors-only), the composition spider chart now renders
full-width with its detail/legend to the RIGHT of the graph instead of below it;
(2) the event description on the recap collapses to its first paragraph with a
"Read more" for claimed viewers, so a long description doesn't push Learnings
far down.

### Detail of changes made:
- `src/components/events/EventAnalyticsSection.tsx`: compute `single` (exactly one
  of founderCount/investorCount > 0). When single, render the one
  `<CredibilityRadar>` full-width with `stacked={false}` (graph + legend
  side-by-side = detail to the right). When both, keep the 2-up `stacked` grid.
- `src/components/events/CollapsibleDescription.tsx` (new): shows the first
  paragraph (up to the first blank line) + a "Read more"/"Show less" toggle;
  single-paragraph text renders in full with no toggle.
- `src/app/events/[slug]/page.tsx`: recap description now uses
  `<CollapsibleDescription>` for claimed viewers (`!unclaimed`); unclaimed
  viewers keep the existing ClaimFadeGate.

### Verification done:
- `next build` compiles + typechecks.

### Potential concerns to address:
- "First paragraph" splits on the first blank line (`\n\n`). A long single-
  paragraph description (no blank lines) won't collapse — fine for the current
  Luma descriptions, but a CSS line-clamp fallback could be added if needed.
