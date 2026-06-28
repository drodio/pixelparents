# Branch: `csv-festival-profile-url` — progress log

## Progress Update as of 2026-06-01
*(Most recent updates at top)*

### Summary of changes since last update
Added a "Festival Profile" column to the scored-profiles Export CSV, immediately
to the right of the LinkedIn column, holding the full canonical profile URL
(`<origin>${profileHref}`, origin = festival.so in prod). Per operator request.

### Detail of changes made:
- `src/components/admin/ProfilesScoredTable.tsx` `toCsv`: new header "Festival
  Profile" after "LinkedIn"; cell = `${window.location.origin}${r.profileHref}`
  (falls back to https://festival.so server-side). tsc + eslint clean.
