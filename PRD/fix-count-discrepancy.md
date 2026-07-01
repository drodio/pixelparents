## Progress Update as of June 30, 2026 — 8:53 PM Pacific

### Summary of changes since last update
Fixed the data discrepancy Daniel flagged: the landing hero showed "Join 6 other Pixel Parents" (completed-only, correct) while the directory + dashboard showed 20 parents / 19 families / 7 kids because getStats counted ALL signups including 14 abandoned draft rows. Filtered getStats (both the fast unfiltered path and the robust/filtered path) to completed signups only (extra.notified='true'), and children to those belonging to a completed family. Verified against prod: now returns 6 parents / 5 families / 4 kids, matching the landing. Also regenerated the social card (opengraph + twitter) with home-page-aligned copy per Daniel's note.

### Detail of changes made:
- lib/db/aggregates.ts getStats: fast path subqueries + robust-path signups/families where-clause + children query now filter completed signups (children via EXISTS on a completed family). Mirrors the COMPLETED_SIGNUP_SQL marker used by lib/db/signups.ts count fns.
- app/opengraph-image.png + app/twitter-image.png: regenerated — "Pixel Parents / Parents helping OHS students build what they wish existed / A community-built home for Stanford OHS families / pixelparents.org".

### Potential concerns to address:
- getBreakdowns distributions (by state/affiliation/grade/skillset) still count all signups — lower-visibility than the headline stats; noted as a follow-up to filter for full consistency.
