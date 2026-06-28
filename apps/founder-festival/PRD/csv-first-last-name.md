# Branch: `csv-first-last-name` — progress log

## Progress Update as of 2026-06-01
*(Most recent updates at top)*

### Summary of changes since last update
Added "First Name" and "Last Name" columns to the scored-profiles Export CSV,
right after the full-name "Name" column (per operator request). Split is first
token = first name, remainder = last name.

### Detail of changes made:
- `src/components/admin/ProfilesScoredTable.tsx` `toCsv`: headers now
  "Name, First Name, Last Name, Company, LinkedIn, Festival Profile, …"; per-row
  first/last derived from `fullName`. tsc + eslint clean.
