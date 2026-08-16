# feat/international-phone

## Progress Update as of [August 15, 2026 — 7:31 PM Pacific]

### Summary of changes since last update

Phone fields now recognise international numbers and say which country they read,
without ever rejecting one. From the Aug 14 student walkthrough. typecheck /
lint / test (1027) / build all exit 0.

### Detail of changes made:

- `lib/phone.ts` (new, no dependency) — `detectCountry`, `toE164`,
  `formatPhone`, `countryHint`, `isPlausiblePhone`, and a curated `COUNTRIES`
  list ordered by who is actually in this community.
- Wired into both phone inputs: signup (`app/signup/signup-form.tsx`) and the
  profile (`app/(authed)/family/member-card.tsx`). Live hint under the field:
  a flag + country name once detectable, otherwise a nudge to include the
  country code.
- 17 tests.

### The rule the tests protect

It never rejects a number. The families most likely to type something this file
doesn't recognise are exactly the international families the school is trying to
reach, so an unrecognised number is UNKNOWN, never INVALID. There are explicit
tests for numbers from countries deliberately absent from the list (+505, +998,
+263): detection returns null and the number still passes.

Two other deliberate calls:
- Longest dial code wins, so +852 isn't read as +8 and +886 isn't read as +88.
- +1 reports as US. US and Canada share the code and nothing in a bare +1 number
  separates them; claiming to know would be a lie, US is likelier, and the
  member can see the hint is wrong and add their own code.

### Potential concerns to address:

- `toE164` exists and is tested but nothing calls it yet. Storage is still the
  raw string. Canonicalising on save is the natural follow-up, but it rewrites
  existing rows so it wants its own change with a backfill.
- No country DROPDOWN. The hint covers the stated need ("tell me it read my
  number as China"); a picker is a bigger UI change and Ava is sending design
  inspiration separately.
- The curated list is 14 countries. Adding one is a single line.
