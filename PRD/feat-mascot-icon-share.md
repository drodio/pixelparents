## Progress Update as of June 30, 2026 — 10:15 PM Pacific

### Summary of changes since last update
Two install-experience touches: (1) the PWA app icon is now the Pixel Parents mascot (the smiling red pixel character from public/images/pixel-clear.png, transparent) centered on a solid black background; (2) the iOS install prompt shows the actual Share glyph (rounded box + up-arrow) inline before "Share icon" as a visual reference.

### Detail of changes made:
- public/icons/{icon-192,icon-512,apple-touch-icon,maskable-512}.png: regenerated from the transparent mascot composited on black, centered on the visible red face mass (the near-black limbs vanish on black, so we center the iconic red square); maskable uses a tighter safe-zone fill. The install prompt's icon preview (/icons/icon-192.png) inherits this.
- components/install-prompt.tsx: added an inline sky-colored iOS Share SVG glyph in the "Tap the Share icon…" line.

### Potential concerns to address:
- On pure black, the mascot's black outline/arms/legs blend in, so the icon reads as the red smiling square (its face). If the limbs should show, use a dark-gray bg instead — flagged for the team.
