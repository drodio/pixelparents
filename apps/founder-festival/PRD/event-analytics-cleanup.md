# PRD — event-analytics-cleanup

## Progress Update as of 2026-06-07 10:07 AM Pacific
*(Most recent updates at top)*

### Summary
Decluttered the event recap analytics: removed the "By the numbers" heading and
the Founder:Investor / Avg-founder-score / Avg-investor-score stat tiles (kept
Attendees/Founders/Investors), and stripped the radar's per-vector value list +
drill-down evidence boxes (they read "0 signals / 0/100" for cohort averages).

### Detail
- `CredibilityRadar.tsx`: new `chartOnly` prop hides the per-vector `<ul>` list
  and the drill-down evidence panel (keeps the chart + the this-founder/typical
  legend line). Profile pages unaffected (default chartOnly=false).
- `EventAnalyticsSection.tsx`: removed the `<h2>By the numbers</h2>`; stat grid is
  now 3 tiles (Attendees, Founders, Investors); radars passed `chartOnly`.

### Verification
- `next build` compiles + typechecks.
