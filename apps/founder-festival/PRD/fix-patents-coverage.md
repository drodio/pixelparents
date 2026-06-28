## Progress Update as of 2026-06-10 (Pacific)
*(Most recent updates at top)*

### Summary
Fixed the [patents] enricher finding ZERO patents for real inventors (Sam Odio's Facebook patents, DROdio's Armory patents). Two root causes: corroboration only matched the CURRENT company (patents are assigned to PAST employers), and the USPTO search used the full name as a phrase (missed "Daniel R. Odio" middle initial / Sam vs Samuel). No migration, no points-logic change — coverage only.

### Detail
- `src/lib/uspto.ts`: search by SURNAME (`lastNameForSearch`) instead of full-name phrase, so middle-initial/nickname forms are caught.
- `src/lib/enrichers/patents.ts`: `inventorIsSubject` (strict first+last, tolerant of middle initials/nicknames + the "Nick - Real Name" BrightData form); `corroboratePatent` now matches the assignee against the subject's WHOLE-career research text (linkedinPageText + searchHighlights) so PAST-employer patents corroborate. Generic company words excluded.
- Tests: patents.test.ts rewritten (inventorIsSubject + career-assignee corroboration). 11 pass.
- Live-verified: Sam Odio → 13 patents (8 granted, Facebook); DROdio → 2 (1 granted, Armory). Both were 0 before.

### Concerns
- Surname search caps at 80 results; for very common surnames the subject's patents may be beyond the cap (rare). Name + assignee gates keep false positives out.
