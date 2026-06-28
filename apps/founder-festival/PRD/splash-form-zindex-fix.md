# Branch: `splash-form-zindex-fix` — progress log

Branched from `main`.

## Progress Update as of 2026-05-26 8:40 PM Pacific
*(Most recent updates at top)*

### Bug
On tall viewports the splash "Do you Qualify for Membership?" heading
was visually clipped — its lower half covered by a dark band.

### Root cause (z-axis)
In `SplashHome`, the cover image is an absolutely-positioned
`h-[60vh]` element with a gradient bottom that fades to solid
`#151515`. The tagline block has `relative` so it paints above the
image, but `<SplashForm>`'s root div was **static (unpositioned)**, so
the positioned cover image painted ON TOP of it. On a tall viewport
60vh reaches the form, and the image's solid-dark gradient bottom
overlapped the heading.

### Fix
Added `relative z-10` to the SplashForm root so the form paints above
the decorative cover image. One-line className change.

### Files
- `src/components/SplashForm.tsx`.

### Verified
- `pnpm tsc --noEmit` clean; rendered HTML shows `relative z-10` on the
  form wrapper.
