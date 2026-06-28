## Progress Update as of 2026-05-28 02:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the amber "Your role's cost multiplier is ×N — scoring is billed at N× the base rate…" note from the admin Credits page balance card.

### Detail of changes made:
- `src/components/admin/AdminCredits.tsx`: deleted the `{costMultiplier > 1 && (...)}` paragraph and dropped the now-unused `costMultiplier` prop (both destructure and type).
- `src/app/(authed)/admin/credits/page.tsx`: removed the `costMultiplier` prop pass, the now-unused `getViewerCostMultiplier()` call, and its import.

### Potential concerns to address:
- None. `getViewerCostMultiplier` (in `src/lib/grants`) and the cost-multiplier mechanic itself are untouched — only this display string was removed. The multiplier still applies elsewhere (e.g. JobLiveProgress cost formatting, roles management).
