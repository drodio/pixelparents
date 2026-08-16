# feat/light-mode

## Progress Update as of [August 15, 2026 — 8:14 PM Pacific]

### Summary of changes since last update

Light mode, with a visible toggle on the landing page and in the app sidebar.
Parents reported they could not read the dark UI, so this is an accessibility
fix rather than a preference. typecheck / lint / test (1027) / build all exit 0.

### Detail of changes made:

- `app/globals.css` — a `[data-theme="light"]` override sheet. The utility list
  was GENERATED from a scan of the codebase (58 distinct white/black utilities,
  2,336 usages) rather than written by hand, so it cannot silently miss one.
- `components/theme-toggle.tsx` — two-state toggle reading the `<html>`
  attribute via `useSyncExternalStore`.
- `app/layout.tsx` — blocking inline script sets the theme before first paint.
- Toggle placed on the public landing AND in the sidebar above Send feedback.
- Landing disclaimer bumped `text-white/45` -> `/55` (was 4.43:1 in dark mode,
  a pre-existing AA failure this pass caught).

### Why the CSS approach

Rewriting 2,336 class usages across 135 files into `dark:` variants is enormous
and every missed spot is an unreadable patch.

The load-bearing detail: Tailwind v4 compiles SOLID colours to
`var(--color-white)` but INLINES alpha variants as literal hex
(`.text-white\/80 { color: #fffc }`). Flipping the variable alone would invert
~1,300 solid usages and leave ~1,900 alpha usages dark — a half-inverted UI,
worse than no light mode. Both halves are handled.

`--color-black` is deliberately NOT flipped: `text-black` sits on amber buttons
where it must stay dark. The one place it must invert is the white-pill button,
handled by a `.bg-white.text-black` pairing rule.

Muted text in light mode is darker than a faithful alpha inversion. The reason
this exists is legibility, so low alphas get a floor (>= 0.62 on white, ~4.9:1)
instead of a pretty port of the dark palette.

### Potential concerns to address:

- Verified on the landing and signup pages in both themes. Pages BEHIND AUTH
  (dashboard, community, resources, events, directory, family, admin) are NOT
  visually verified — no signed-in session locally. The overrides are
  class-based so they apply everywhere, but that is reasoning, not observation.
- The contrast auditor used during this pass only reads `background-color`, so
  it produces false failures for text over gradient backgrounds. Findings were
  confirmed element-by-element rather than trusted wholesale.
- No toggle on /signup itself. It persists from the landing page, but a member
  who deep-links straight to /signup can't switch there.
- Default is the OS preference when nothing is stored, so a parent whose laptop
  is in light mode gets a readable site without finding the toggle first.
