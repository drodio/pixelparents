## Progress Update as of 2026-06-07 Pacific

### Summary
New [google-kg] enricher: a Google knowledge panel = notability threshold. DROdio
added GOOGLE_API_KEY. (YouTube Data API not yet enabled — companion signal pending.)

### Detail
- `enrichers/google-kg.ts` — KG entities:search, gated on name overlap +
  CORROBORATION (kgNameOverlap + kgCorroborated, tested) so a same-named celebrity
  can't attach. Live-verified on a famous chip-company founder.
- `scoring.ts` — corroborated KG entity → +4 once [Domain]. Waterfall step + google.com
  host mapping. 26 tests pass. Rescore-to-apply.
