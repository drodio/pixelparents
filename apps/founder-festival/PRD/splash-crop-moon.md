# Branch: `splash-crop-moon` — progress log

Branched from `main` (post PR #53).

## Progress Update as of 2026-05-26 1:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Splash hero still showed the moon at the top after PR #53's reflection
crop. Iterated on the source PNG, cropping additional pixels off the
top per the user:

- After PR #53: 1695×700
- Crop 70 off top (moon-disc removal attempt): 1695×630
- Crop 40 off top (moon glow still visible): 1695×590
- Crop 40 off top (small moon disc still visible above tent): 1695×550
- Crop 20 off top (user-requested fine-tune): **1695×530**

Total ~170px removed from the top of the original 700-tall source.
Net visible: clean tent + people + dock, no moon, no reflection. CSS
remains `object-cover` (default centering — no `object-top` etc).

### Files touched:
- `public/images/founder-festival-outside.png` — re-cropped.

### Potential concerns:
- If the moon glow is still creeping in on certain viewport sizes,
  another small top-crop will dial it out further. Cheap to iterate.
