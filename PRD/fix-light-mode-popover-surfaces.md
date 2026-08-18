## Progress Update as of [August 18, 2026 — 3:05 PM Pacific]

### Summary of changes since last update

First entry on this branch. Branched off `main` at `ede494f` (#217) during a
review of the #210–#218 batch. #215 fixed light mode for the `zinc-950` chrome
(the "left side stays dark" bug) but missed the SAME class of bug one elevation
up: `bg-zinc-900`, `bg-zinc-900/95`, `bg-neutral-900` and the hardcoded
`bg-[#1d1d21]` had no `[data-theme="light"]` override, so every dialog, dropdown,
popover and tooltip using them kept a dark background while this sheet remapped
their `text-white/*` to DARK — dark-on-dark, contents unreadable.

### Detail of changes made:

- **How the gap was found.** Enumerated every `zinc|neutral|slate|gray` colour
  utility actually used under `app/` and `components/`, then checked each against
  the `[data-theme="light"]` override list in `app/globals.css`. Four uncovered:
  `bg-zinc-900`, `bg-zinc-900/95`, `bg-neutral-900`, `bg-[#1d1d21]`.
- **Why it is a real bug, not cosmetic.** `[data-theme="light"] .text-white/70`
  maps to `rgb(24 24 27 / 0.78)` — dark text. With the panel still at zinc-900
  (`#18181b`), that is dark text on a dark panel.
- **Affected surfaces (18 call sites)**, all raised/elevated:
  - `components/city-autocomplete.tsx` — the dropdown used by the onboarding
    wizard's **City & State** step (`bg-neutral-900`)
  - `app/signup/thanks/student-parent-form.tsx` — the student flow's parent
    invite dialog (`bg-neutral-900`)
  - `components/`: `faq-dialog`, `github-dialog`, `help-button` (×2),
    `feedback-prompt` (×2), `feedback-widget` (×2), `walkthrough-tour`,
    `irl-tooltip`, `mention-caption-input`, `world-map` tooltip
  - `app/(authed)/`: `events/add-to-calendar`, `events/[id]/admin-manager` (×2),
    `community/mention-input`, `admin/ui` sticky table header
- **The fix** adds four rules next to the existing zinc-950 block, mapped onto
  the sheet's OWN elevation scale rather than another magic hex: these are all
  elevation-2 surfaces, and `:root[data-theme="light"]` already defines
  `--surface-2: #efeff1` ("popovers / raised controls"). So
  `background-color: var(--surface-2)`.
- **Verified at runtime**, not just by reading CSS: with `data-theme="light"` set
  on the live dev server, computed styles are `bg-zinc-900` →
  `rgb(239, 239, 241)`, `bg-neutral-900` → `rgb(239, 239, 241)`, `bg-[#1d1d21]` →
  `rgb(239, 239, 241)`, `bg-zinc-900/95` → `rgba(239, 239, 241, 0.97)`, against
  text at `rgba(24, 24, 27, 0.78)`. Also confirmed present in the minified
  production CSS (note: the production build emits the selector unquoted as
  `[data-theme=light]`).

### Potential concerns to address:

- **The underlying fragility is unchanged.** Light mode is a hand-maintained list
  of per-utility overrides in `app/globals.css`. Any new dark-only utility used
  anywhere in the app is invisible until someone notices it stayed dark — this is
  now the second time this exact bug class has shipped (#215, then this). A lint
  rule, a build-time check that every colour utility used in the tree has a light
  mapping, or moving components onto the `--surface-*` tokens would end the class
  rather than the instance. Worth its own issue.
- `admin/ui.tsx` uses `bg-zinc-900` for a STICKY TABLE HEADER rather than a
  popover. At `--surface-2` (#efeff1) it still reads as distinct from the white
  page, so it is fine, but it is the one call site where "elevation 2" is not
  literally an overlay.
- No unit test covers this — the repo has no CSS/visual regression harness. The
  runtime computed-style check above was done by hand.
