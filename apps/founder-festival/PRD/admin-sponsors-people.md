# PRD — admin-sponsors-people

## Progress Update as of 2026-06-08 10:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The /admin/sponsors list now shows each sponsor's **attached people's names** under the sponsor
(e.g. "Jordan Lee, Alex Kim"), or "No people attached". No schema/migration.

### Detail of changes made:
- `src/app/(authed)/admin/sponsors/page.tsx`: fetch `getSponsorProfiles` per sponsor and pass
  `people: {evaluationId, fullName}[]` into the manager.
- `src/components/admin/SponsorsManager.tsx`: `SponsorRow.people` added; each row renders the
  comma-joined people names (truncated) or a muted "No people attached"; newly-created sponsors
  start with `people: []`.

### Potential concerns to address:
- Interpreted "names of the sponsors" as the attached PEOPLE (the company names already showed);
  confirm that's what DROdio wanted.
