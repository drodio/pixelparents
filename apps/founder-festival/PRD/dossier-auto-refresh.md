# dossier-auto-refresh

## Progress Update as of 2026-06-22 02:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Bundled a dossier-title precedence fix into this branch. The run endpoint now
prefers the curated `credibility_title` over the raw pipeline-extracted
`job_title` when building the Chief prompt.

### Detail of changes made:
- `src/app/api/dossier/run/route.ts` — title now
  `ev.credibilityTitle?.trim() || ev.jobTitle?.trim() || null` (was job_title
  first). Root cause of Chief's "Title Note": Erika's `job_title` on prod is "CEO"
  (extracted by the scoring pipeline; `source=url`) while her `credibility_title`
  holds the accurate "Co-Founder & CCO … founder of Building Humane Technology".
  Not hardcoded; not a prompt bug — a field-precedence issue.

## Progress Update as of 2026-06-22 02:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The profile dossier box now updates itself — no manual refresh. While a dossier is
generating it polls the server every 30s via `router.refresh()` and flips to the
"View" link the moment the cron marks it ready. On that running→ready transition
the box flashes green for 30s to draw the eye.

### Detail of changes made:
- `src/components/ProfileDossierBox.tsx`:
  - Added `useRouter` + a polling effect: while `status === "running"`,
    `setInterval(() => router.refresh(), 30_000)`; tears down when status changes.
    `router.refresh()` re-runs the server component so the box re-renders with the
    DB's latest status without a full reload.
  - Added a running→ready transition detector (a `useRef` that survives
    `router.refresh()` re-renders) → `justReady` state → 30s `setTimeout`. The
    "View" box gets a green border/bg/ring while `justReady`. An already-ready
    dossier on a fresh page load does NOT flash (only the live transition does).
  - Both effects are declared unconditionally (rules of hooks) and gated inside.

### Potential concerns to address:
- 30s poll cadence means up to ~30s lag between the cron marking ready and the box
  flipping. Fine for a ~10-min job; tighten if it ever feels slow.
- `router.refresh()` re-runs the whole profile route's server components every 30s
  while generating (one viewer, one in-flight dossier at a time) — negligible load.
