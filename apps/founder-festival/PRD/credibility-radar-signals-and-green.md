## Progress Update as of 2026-05-28 05:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Extended the green-on-selected treatment beyond just the text labels.
The vertex dot, the score number on the chart, and the score number in
the list row all switch to green when their vector is selected. The
polygon's fill and stroke render with a radial gradient centered on the
selected vertex (green → gold over radius R) so adjacent axes appear
warmer than the opposite axis. Falls back to solid gold when nothing is
selected.

### Detail of changes made:
- `src/components/CredibilityRadar.tsx`:
  - Compute `activeVertex` (the [x, y] of the selected vertex if any).
  - Add a conditional `<defs><radialGradient id="radar-fade" ... /></defs>`
    block inside the SVG when `activeVertex` is non-null.
  - Polygon `fill` / `stroke`: `GOLD` → `url(#radar-fade)` when selected.
  - Vertex `<circle>` `fill`: `GOLD` → `GREEN` when active.
  - Axis label number (`<tspan>`): `GOLD` → `GREEN` when active.
  - List row score number: `GOLD` → `GREEN` when active (inline style
    swap).

### Potential concerns to address:
- Radius `R` was picked because pentagon side length ≈ R, so adjacent
  vertices land at ~85% of the gradient (already mostly gold). If we want
  a more dramatic spread to neighboring axes, bump to `r={R * 1.3}` or so.
- `gradientUnits="userSpaceOnUse"` ties the gradient to absolute SVG
  coords. If the radar ever moves to a different viewBox, the gradient
  center recomputes via `polar()` so this is robust.

## Progress Update as of 2026-05-28 05:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Credibility radar tweaks: every vector row now shows "[n] signals" in the
small subtext slot (previously only no-coverage rows showed "no direct
signal" and rows WITH coverage showed nothing). When a vector is selected,
the axis label on the SVG, the row label in the list, and the drill-down
box header all switch to green (`#10b981`) to make the active selection
obvious across the three surfaces at once.

### Detail of changes made:
- `src/components/CredibilityRadar.tsx`:
  - New `GREEN = "#10b981"` constant alongside the existing `GOLD`.
  - SVG axis label `fill`: `"#fff"` → `GREEN` when active.
  - List row: dropped `text-white` from the active state, switched to
    inline `style={{ color: GREEN }}`. Inactive rows keep `text-zinc-300`.
  - Drill-down `<h4>` title: `text-zinc-100` → inline `color: GREEN`.
  - Subtext span: always renders `{evidence.length} signal[s]` with
    singular/plural handling. The previous `{!coverage && "no direct
    signal"}` conditional is gone (the count covers both cases — "0
    signals" replaces "no direct signal").

### Potential concerns to address:
- The green is a single fixed hex (`#10b981`, Tailwind's emerald-500).
  Doesn't follow the existing CATEGORY_COLOR system. If you want
  per-vector colors later, this would centralize where the highlight
  lives.
- "0 signals" reads slightly oddly compared to "no direct signal" — the
  old phrasing was a deliberate hedge ("we have a percentile but no
  attributed evidence rows yet"). If "0 signals" feels misleading later,
  consider switching back to "no direct signal" when length === 0.
