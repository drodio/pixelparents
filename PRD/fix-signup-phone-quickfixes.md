# fix/signup-phone-quickfixes

First branch of the "Go Pixel Changes V2" round (Ava's V2 doc + the two Aug 14
walkthroughs). This one is the quick copy/UX fixes; the multi-page onboarding
rebuild ships separately.

## Progress Update as of [August 16, 2026 — 8:05 AM Pacific]

### Summary of changes since last update

First entry. Phone fields now format the number into its country's shape on blur
instead of announcing "🇨🇳 Detected China"; the signup identity section is titled
"Your info" for every role with the subtitle removed.

### Detail of changes made:

- **`lib/phone.ts`** — `formatPhone` learns China's 3-4-4 mobile grouping
  (`+86 138 1234 5678`, the exact shape requested in the V2 doc). US keeps its
  existing 3-3-4. Other countries stay dial-code + digits on purpose — imposing
  a guessed grouping would be wrong more often than helpful. Detection rules
  untouched; the never-reject rule untouched.
- **`lib/phone.test.ts`** — the old "+86 stays ungrouped" expectation replaced
  by the new grouping cases, plus guards that a non-standard-length +86 number
  and other countries still pass through ungrouped.
- **`app/signup/signup-form.tsx`** — phone input formats on blur (not per
  keystroke — rewriting the value mid-typing fights the cursor). The "Detected
  <country>" caption is gone; the "include your country code" helper now shows
  only while the country is unknown. Identity section: `title="Your info"` for
  all roles (parents found "First parent's info" confusing, and for a joining
  co-parent it was simply wrong), subtitle removed per the V2 doc.
- **`app/(authed)/family/member-card.tsx`** — same blur-format + caption
  removal, so the family editor matches the signup field.

### Verification run

- `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` — all
  exit 0, checked by explicit per-step exit codes (1035 tests: 1034 baseline,
  one phone.test.ts case replaced by two covering the new grouping).

### Potential concerns to address:

- Format-on-blur writes the formatted string into form state, so the stored
  value contains spaces/parens. `digitsOf`/`toE164` normalise downstream and
  `isPlausiblePhone` ignores formatting, so nothing downstream cares — but if
  an exact-string comparison against stored phones exists somewhere unaudited,
  it would now see the formatted shape.
- A bare 11-digit number starting with 1 (a Chinese mobile typed without +86)
  is still detected as US by the pre-existing heuristic and gets US grouping.
  Unchanged behaviour, worth knowing when reading bug reports; the placeholder
  and helper both steer international members toward typing the +.
