## Progress Update as of 2026-06-05 11:25 PM Pacific
*(Most recent updates at top)*

### Summary
Second audit pass (871 profiles) → fixed lost-signal attribution gaps: rows that
score points but attribute to NO radar vector. Bundled into this branch/PR (same
class: radar-attribution accuracy, view-time, no rescore).

### Detail
- `scripts/audit-radar-attribution.ts` (NEW, read-only): finds (1) lost signal —
  points scoring but hitting null attribution, aggregated by reason shape;
  (2) single-row vector domination; (3) investor coverage. Run vs prod.
- Founder traction regex now catches spelled-out valuations ("$29 billion",
  "valued at", "market cap") — alexandr-wang was losing his entire 29k traction
  axis to null, wade-foster 7k.
- Investor firm regex now has a bare-`investor`/`scout` catch-all + portfolio
  catches "portfolio including" — ~550 investor points were lost across thin
  investor profiles.
- +2 test blocks (5 assertions) in `credibility-vectors.test.ts`; 23 pass.
- Single-row domination (102 hits) is almost all F:traction = one company IPO —
  EXPECTED (a founder's traction IS their company's outcome), not a bug.

---

## Progress Update as of 2026-06-05 11:05 PM Pacific
*(Most recent updates at top)*

### Summary
Fix for the #1 systemic scoring-quality issue found by the 870-profile audit: the
radar percentile inflated thin scores (42 founders with technical raw 13–19 at the
85–88th percentile) because it ranked against a zero-heavy population. New
`signalHaverPercentile` ranks only against profiles with signal on that axis.

### Detail
- `credibility-vectors.ts`: `signalHaverPercentile(value, pop)` — percentile vs
  `pop.filter(p>0)`; returns 0 for value<=0 (no signal). +3 unit tests proving the
  de-inflation (13 went 71→13; 150→88; 0→0).
- `credibility.ts`: both radar call sites (single-profile + cohort average) use it.
- PRESENTATION change only — no points/rules/attribution changed; takes effect at
  VIEW TIME (no rescore needed) for all profiles + every vector.

### Note
Pre-existing tsc errors in `tests/lib/sms.test.ts` are another agent's (not mine,
don't block the build). My credibility files compile clean.
