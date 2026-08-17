# fix/lightmode-sidebar

Second branch of "Go Pixel Changes V2 round 2": light mode must apply
everywhere (the sidebar stayed dark), the theme toggle becomes a subtle icon in
the account row, and sidebar text/icons get one size notch. Kept deliberately
light — Ava has a full UI/UX revamp planned.

## Progress Update as of [August 16, 2026 — 7:15 PM Pacific]

### Summary of changes since last update

First entry. Root cause of the dark-sidebar-in-light-mode bug: every piece of
app chrome uses `bg-zinc-950` (solid or /80 /85 /90), and the generated light
override sheet never contained a single zinc rule — the sheet flips `black` and
`white` alphas only. Four sheet rules fix the sidebar, mobile top bar, bottom
tab bar, drawer, mobile sheets, the report dialog, and the events side panel in
one go. Toggle relocated; nav sized up.

### Detail of changes made:

- **`app/globals.css`** — four `[data-theme="light"] .bg-zinc-950…` rules
  (solid → #fafafa; /80 /85 /90 → near-opaque off-white), placed with the
  existing bg-black block and following its alpha-bump convention. Off-white
  rather than pure white so chrome still reads as chrome against white content.
  Covers all 8 zinc-950 usage sites found by grep — none remain unmatched.
- **`components/icons.tsx`** — IconSun + IconMoon in the house stroke style.
- **`components/theme-toggle.tsx`** — new `variant="icon"`: compact icon-only
  button (SVG, no emoji). The pill variant (public landing keeps it — that
  placement was a deliberate pre-sign-in accessibility decision) also swaps its
  emoji for the SVG glyphs.
- **`components/dashboard-shell.tsx`** — the full-width "☀️ Light" pill above
  Send-feedback is gone; an icon toggle now sits beside the account chip (a
  SIBLING of the /account Link — a button can't nest inside a Link). Nav links:
  text-sm → text-[15px], icons h-5 → h-6 (drawer inherits both).

### Verification run

- typecheck / lint / test / build — all exit 0 per-step (1043 tests — main's
  current baseline, none added: this branch is CSS + presentational JSX).

### Potential concerns to address:

- **Not visually verified signed-in.** The affected chrome is behind auth; the
  sheet rules are mechanical and follow the proven bg-black pattern, but the
  real check is Ava's signed-in QA pass in BOTH themes (already on her list).
  Specifically eyeball: sidebar, mobile top/bottom bars, the More drawer, a
  mobile sheet, and the report dialog in light mode.
- `backdrop-blur` over near-opaque off-white is subtle to invisible — fine, but
  if the light sidebar looks flat vs. the dark one, that's why.
- The toggle is now less discoverable by design (Ava's call, revamp pending).
  The landing-page pill remains the first-run discovery surface for parents
  who can't read dark mode.
- Icon/text sizing was bumped exactly one notch; "a bit bigger" is subjective —
  cheap to nudge again after the QA pass.
