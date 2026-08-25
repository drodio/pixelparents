# feat/round5-polish

Round 5 (Aug 24 doc), PR C of three. Stacked on feat/student-flow-order (PR B)
— merge order: #222 → #223 → this.

## Progress Update as of [August 24, 2026 — afternoon Pacific]

### Summary of changes since last update

First entry. The Chappaqua city-autocomplete bug fixed WITHOUT Google Maps
(Photon layer filter was excluding hamlets), plus the round's copy, layout,
socials, and family-disconnect items.

### Detail of changes made:

- **City autocomplete actually finds small places.** The Photon query sent
  `layer=city` only — Photon files hamlets/villages like Chappaqua, NY under
  `locality`, so the only "matches" were fuzzy far-away ones (the doc's India
  screenshot). The query now requests city + locality + district. No Google
  Maps needed: keyless, no billing, and coverage is OSM-complete. If coverage
  still disappoints after this, Google Places is the escalation — needs a key
  + billing decision from Ansh.
- **City step:** title "Where are you located?"; State now LEFT, Country
  RIGHT (US members change State far more often than Country).
- **Socials step:** title "Connect your profiles" (Ava's pick); "Personal
  Website" joins the dropdown-adder, writing the existing websiteUrl field
  (sanitized, already rendered on profiles behind the "links" opt-in) — full
  URL, not a handle.
- **Verify success copy (wizard):** heading "Your account has been verified",
  body just "Verified with <email>." — the "You're all set — keep going."
  sentence removed per the doc. /account keeps its personalized wording.
- **Family disconnect (round 5: "remove their children's profile from their
  own"):** new family-scoped `disconnectStudentFromFamily` action — students
  only, never yourself, membership-authorized like every action in that file.
  The student's account survives intact on a fresh family of its own; only the
  tie is cut. Member-card shows a two-click "Disconnect from family" control
  on student cards (not your own).

### Verification run

- typecheck / lint / test / build all exit 0 per-stage via pipestatus; 1062
  tests (no new: geocoder query + presentational + a family-scoped action in
  the established untested-db-layer style).

### Potential concerns to address:

- Disconnect does NOT touch children-table rows (a linked child row keeps its
  family) — her ask was about the student's PROFILE tie; if a matched child
  row should follow the student out, that's a product decision (flagged).
- Disconnected students lose family-verified status derivation (their new
  family has no verified parent) — approval state on their own row persists,
  so an approved student stays approved. Worth watching in QA.
- Photon layer broadening may surface odd district-level suggestions in dense
  cities; MAX_SUGGESTIONS still caps at 8 and the picker remains optional
  free text.
