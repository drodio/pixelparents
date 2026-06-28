# Branch: `rescore-stale-profiles` — progress log

Branched from `main` on 2026-05-26.

Feature 2: create a bulk scoring job that re-scores everyone NOT scored since a
chosen date/time, filtered by source (Web / Bulk / API checkboxes).

## Progress Update as of 2026-05-26 5:42 PM Pacific
*(Most recent updates at top)*

### Summary
csvToJobLines now strips the Founder Festival template's prose rows (title /
"NOTE:" / "…try whatever you've got") AND finds the real header row ANYWHERE
(not just row 0), so an unedited-template upload no longer ingests the
boilerplate + "Full Name,Company" header as data. TDD: +2 csv-to-lines tests
(template-with-data → only the data; blank template → ""). 17/17 pass.

## Progress Update as of 2026-05-26 5:38 PM Pacific
*(Most recent updates at top)*

### Summary
Moved the "Flexible formatting" copy INTO the textarea as its placeholder (bullets
shown until the operator types); the area above now carries only the "# lines are
comments" note. Replaced the old "# YC W25 founders…" placeholder. The CSV line
sits on its own line (blank line before it, no bullet) to read as an alternative.

## Progress Update as of 2026-05-26 5:32 PM Pacific
*(Most recent updates at top)*

### Summary
Reworded the "Paste or Upload" help text to be friendly but ACCURATE about the
parser. Checked `parsePasteInput` with DROdio: it's deterministic pattern-matching
(not AI) — one URL/line, Name[,Company]/line, a YC-paste special case, and CSV.
It does NOT handle comma-delimited or arbitrary "jumbled" input, so the copy
claims only what's true (URL/line, Name[,Company]/line, drag-in CSV, # comments).
Per DROdio, dropped the YC-paste bullet from the copy (feature still works, just
not advertised).

## Progress Update as of 2026-05-26 5:20 PM Pacific
*(Most recent updates at top)*

### Summary
Polish on the "Paste a list" mode of /admin/score/new (same page as feature 2):
- "Subjects — one per line" label → **"Paste or Upload"**.
- "Upload CSV" is now a **gold-outline pill** matching the leaderboard control
  (`border-[#dfa43a]/60 text-[#dfa43a]`), icon removed.
- New **"Sample CSV"** gold `.link` to its left → downloads
  `/founder-festival-csv-template.csv` (copied into public/ from DROdio's
  template; `download` attr names it "Founder Festival CSV Template.csv").

Verified: tsc + eslint clean; the CSV serves (200) and /admin/score/new compiles.

## Progress Update as of 2026-05-26 5:08 PM Pacific
*(Most recent updates at top)*

### Summary
New "Re-score stale profiles" mode on /admin/score/new. Targets successful
(score > 0) profiles last scored before a cutoff, of the selected sources, and
queues a normal scoring job that re-scores them in place.

### Detail of changes made:
- `profiles-scored.ts`:
  - `parseSelectedSources(raw)` — normalize the source checkboxes (empty/invalid
    → all three). `matchesSourceFilter({chargeCents,isBulk}, selected)` — reuses
    `classifyProfileSource` so the filter can't drift from /admin/profiles.
  - `selectStaleProfiles({ notScoredSince, sources })` — evals where
    source="url" AND score > 0 AND updatedAt < cutoff, filtered by DERIVED source
    (shares the charge/bulk derivation with listScoredProfiles). Returns
    `{ id, linkedinUrl }`.
- `POST /api/admin/jobs`: new `staleFilter` mode (+ `dryRun`). dryRun → returns
  `{ count, estimatedCents }` for the live preview; otherwise creates a job whose
  items carry `evaluationId` + status "resolved" so the cron worker reEvaluates
  (re-scores IN PLACE) rather than hitting the URL cache.
- `components/admin/StaleRescoreForm.tsx` (new): datetime input, Web/Bulk/API
  checkboxes (default all), model toggle, live preview (count + est cost via
  dryRun), Create. No useEffect — preview re-fetches from the control handlers.
- `NewJobForm.tsx`: a mode toggle ("Paste a list" / "Re-score stale profiles")
  renders the existing paste form or the new StaleRescoreForm.

### Verification:
- TDD: `stale-profiles-filter.test.ts` (6: parseSelectedSources + matchesSourceFilter).
  tsc + eslint clean. Live against dev DB: cutoff ~1pm PT 5/26 → 84 stale (6 web +
  78 bulk + 0 api; partition sums correctly). /admin/score/new compiles (200).
  Full preview→create flow to be confirmed in a logged-in admin browser.

### Potential concerns:
- Re-scores IN PLACE (overwrites evals). If feature 1's run-history lands, these
  refreshes would snapshot per-run too.
- No hard cap on match count yet — the preview (count + est cost) is the
  guardrail; a very old cutoff could queue a large/expensive job.
