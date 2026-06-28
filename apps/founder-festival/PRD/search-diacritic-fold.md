# search-diacritic-fold

## Progress Update as of 2026-06-11 9:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed leaderboard/header/admin search not finding profiles when the query has
different diacritics than the stored name — e.g. Luma's "Ebru Yıldırım" (Turkish
dotless ı) failed to find the existing profile stored as ASCII "Ebru Yildirim".

### Detail of changes made:
- `src/lib/leaderboard.ts`: added `asciiFoldForSearch(s)` (maps Turkish ıİşŞğĞüÜöÖçÇ
  → ASCII, then NFKD-strips accents, lowercases). In `searchLeaderboard`, each
  token now ALSO matches a folded needle against `evaluations.slug` (the slug is
  itself the ASCII-folded name), making search diacritic-insensitive. Existing
  raw-needle conditions (fullName/linkedin/company) unchanged.
- `tests/lib/search-diacritic.test.ts`: pure fold tests + a DB test proving an
  ASCII-stored "Ebru Yildirim" (slug ebru-yildirim-*) is found by the Turkish
  query "Ebru Yıldırım".

### Potential concerns to address:
- Robust for ASCII-stored names with clean slugs (the common case). A name STORED
  with Turkish chars whose slug got mangled wouldn't fold cleanly — rare; a
  separate unaccent-on-column pass could handle it if needed.
