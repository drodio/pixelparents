## Progress Update as of July 8, 2026 — 3:30 AM Pacific

### Summary of changes since last update
First entry. Added keyless, privacy-preserving city autocomplete to the two
places users type a city — the signup form and the family editor. A bundled,
static list of ~1072 major world cities (name + country, plus US state for US
cities) drives client-side prefix/substring matching; nothing is ever sent to
an external geocoding API and no keystroke leaves the browser. Picking a
suggestion fills City and auto-populates Country (and US State when applicable);
free-text entry of any city is still fully allowed.

### Detail of changes made:
- **`lib/cities.ts`** (new, AUTO-GENERATED, ~31 KB): the bundled dataset. Stored
  as compact tuples (`[name, country]` or `[name, "United States", state]`) then
  mapped to `City` objects at module load to keep the source small. Country
  labels match `lib/options.ts` `COUNTRIES` EXACTLY and US state names match
  `US_STATES` exactly, so a picked suggestion can auto-fill the existing
  Country/State `<select>`s. Validated programmatically: 0 country mismatches,
  0 US cities carrying a non-listable state. Washington DC intentionally ships
  WITHOUT a state (DC isn't in `US_STATES`, so it would set a value the State
  `<select>` can't display) — city + country still fill.
- **`scripts/gen-cities.mjs`** (new): the reproducible generator for
  `lib/cities.ts`. Curated source lists (top ~330 US cities by population with
  full state names; most-populous cities per country for every country in
  `COUNTRIES`). Run `node scripts/gen-cities.mjs` to regenerate. Source is
  public place-name data only — NO PII.
- **`components/city-autocomplete.tsx`** (new): reusable `<CityAutocomplete>`
  client component. Mirrors the repo's `TagPicker` idiom (gold `HighlightedText`
  on the typed substring, `bg-neutral-900` dropdown, amber accents). Matching:
  case-insensitive, prefix matches ranked before substring matches, capped at 8.
  Keyboard-accessible: ArrowUp/Down to move, Enter to pick the highlighted row
  (Enter with nothing highlighted falls through so free text still submits),
  Esc to close; ARIA combobox/listbox/option roles + `aria-activedescendant`.
  Closes on outside click. A `justPicked` ref suppresses the menu re-opening
  right after a selection.
- **`app/signup/signup-form.tsx`**: replaced the plain `city` `<input>` with
  `<CityAutocomplete>`. Free typing routes through the existing
  `set("city", …)` (Country untouched). A new `pickCity(picked)` sets city +
  country + state in one queued save; non-US picks clear state so the existing
  "US-only state" invariant holds.
- **`app/(authed)/family/member-card.tsx`**: same swap + `pickCity` handler,
  mirroring the signup form.

### Potential concerns to address:
- **Dataset coverage is curated, not exhaustive.** ~1072 cities covers the most
  populous globally; a user in a smaller town just types it free-hand (fully
  supported). To expand, edit `scripts/gen-cities.mjs` and rerun it — do NOT
  hand-edit `lib/cities.ts`.
- **Adding a new country to `lib/options.ts` `COUNTRIES`** won't get cities until
  someone adds rows to the generator. The generator does NOT auto-fail on a
  missing country; the alignment check is manual (rerun the validation snippet
  in the PR description if `COUNTRIES` changes).
- **A third city input exists** at `app/(authed)/admin/parents/[id]/edit/edit-form.tsx`
  (admin-only). Left as a plain input — out of scope for this task (not a place
  end users type their city). Easy follow-up if desired: it uses the same
  `set("city", …)` shape.
- The `city` value the parent still owns is the source of truth; the component is
  purely presentational over it, so autosave/draft-restore behavior is unchanged.
