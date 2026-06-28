## Progress Update as of 2026-05-26 06:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry for the `mobile-input-zoom` branch (cut from `main` after the mobile
PR #86 merged). Fixes three iOS-Safari splash issues the founder hit on a real
phone: the keyboard popped up on load and hid the page, the page zoomed in and
cut off the right edge of the LinkedIn input on focus, and the `your-handle`
placeholder needed to be the gold link color.

### Detail of changes made:
- **`src/components/SplashForm.tsx`**
  - Removed the `autoFocus` attribute on the LinkedIn-handle input. Focus is now
    applied via a `useEffect` that only fires on desktop
    (`matchMedia("(hover: hover) and (pointer: fine)")` — true for mouse/trackpad,
    false for touch). So phones/tablets land on the splash with the keyboard
    DOWN and the full page visible; desktop keeps the autofocus + cover-image
    reveal exactly as before.
  - Placeholder color changed from `placeholder:text-zinc-600` to
    `placeholder:text-[#dfa43a]` (the gold `.link` color) — applies on both
    mobile and desktop.
- **`src/app/globals.css`** — added a `@media (max-width: 639px)` rule forcing
  `input, select, textarea { font-size: 16px !important }`. iOS Safari auto-zooms
  into any focused control with font-size < 16px (the inputs were `text-sm` =
  14px), which is what cut off the right edge. 16px on mobile stops the zoom
  site-wide (splash, account, apply, claim, invite code). Desktop (≥640px) keeps
  its Tailwind sizes.

### How it was verified:
- Playwright (Chrome) in both a touch mobile context (390×844) and a desktop
  context (1280):
  - Mobile: input computed `font-size: 16px`, placeholder `rgb(223,164,58)`,
    `document.activeElement` is NOT the input on load (keyboard stays down).
  - Desktop: input `14px` (unchanged), placeholder gold, input IS focused on
    load (autofocus + cover-image reveal preserved).
- `tsc --noEmit` passes.

### Potential concerns to address:
- **Lightning CSS gotcha (important):** Tailwind v4's Lightning CSS SILENTLY
  DROPS a `@media` rule whose value is fractional (e.g. `max-width: 639.98px`)
  and/or uses a `:not([type="checkbox"])` chain — the rule never reached the
  compiled CSS. Use a plain integer `max-width: 639px`. There's a 1px gap at
  639–640px but no real device sits there. If future global CSS rules "don't
  apply," check the compiled `/_next/static/.../*.css` to confirm they weren't
  dropped.
- The 16px rule applies to native checkbox/radio inputs too, but font-size has
  negligible effect on their rendered size and the app uses custom toggle
  buttons rather than native checkboxes, so this is harmless.
