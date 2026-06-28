# Profile await-waterfall batching — profile-waterfall-batching

## Progress Update as of 2026-06-10 — Perf P1-3
*(Most recent updates at top)*

### Summary of changes since last update
Collapsed the `/profile` server-component await waterfall: 7 independent,
row-keyed reads that ran sequentially (each a fresh neon-http TLS round-trip) now
run in a single Promise.all.

### Detail of changes made:
- Batched: `loadScoreItems`, `getCredibilityRadars`, `getMatrixCandidates`,
  `getCurrentViewerContext`, `canonicalProfileUrl`, the badge-overrides select,
  and `getPublicFamilyBadges` — all keyed only on `row` / the viewer session, so
  order-independent. `getMatrixCandidates` is now gated on `showRadar`
  (== `radars != null`), behaviorally identical to the old `radars ? … : null`.
- Removed the scattered later declarations (they read from the batch now). The
  existing percentiles/savedRows/privacyRows Promise.all is untouched.
- No behavior change — purely overlapping I/O that previously stacked.

### Potential concerns to address:
- profile/page.tsx is a hot file (concurrent feature work); rebase promptly.
