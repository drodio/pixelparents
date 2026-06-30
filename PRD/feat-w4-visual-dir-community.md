## Progress Update as of [June 30, 2026 — 7:04 AM Pacific]

### Summary of changes since last update
First entry on this branch. Began the W4 visual/motion polish for the **Directory**
and **Community** surfaces. Installed `framer-motion@^12` (replacing the worktree's
symlinked node_modules with a real install). Landed the Directory half: staggered
grid reveal + AnimatePresence animated filtering, card hover-lift + chevron reveal,
a shimmer skeleton fallback, a count-up + iconified stat strip (numbers white,
amber icon accent), and an animated world map (staggered pin drop-in, pulsing
largest clusters, hover/tap tooltips). All motion gated on `prefers-reduced-motion`.

### Detail of changes made:
- `package.json` / `package-lock.json`: added `framer-motion@^12.42.1`.
- `app/(authed)/directory/motion.ts` (NEW): shared grid container/item variants +
  reduced-motion fallback variants + a soft spring. Single-sourced so Directory and
  Community share the same reveal rhythm.
- `app/(authed)/directory/showcase-skeleton.tsx` (NEW): static skeleton grid
  mirroring the real Card (hero/title/two chip rows/thumb strip) using `pp-shimmer`.
  Rendered as the Suspense fallback (was `fallback={null}`).
- `app/(authed)/directory/stat-strip.tsx` (NEW): client count-up stat strip. Numbers
  tick 0→value on mount via rAF easeOutCubic; each stat gets an icon chip
  (Home/Users/GradCap/Code). Number rendered white, amber reserved for the icon chip.
  Under reduced motion the final value shows immediately.
- `app/(authed)/directory/page.tsx`: imports the new components; removed the inline
  amber-number StatChip; uses `<StatStrip>` and `<ShowcaseSkeleton>`.
- `app/(authed)/directory/showcase-client.tsx`: grid wrapped in a motion container
  keyed on a filter signature (`gridKey`) so the stagger replays on filter change;
  cards are `motion.create(Link)` items inside `<AnimatePresence mode="popLayout">`
  so they animate in/out instead of hard-cutting; hover lift (`y:-4`) + amber shadow
  + a chevron that slides in on hover. `controlCls` radius bumped `rounded-md`→
  `rounded-xl` per the radius-rhythm note. `reduce` passed to each Card.
- `components/world-map.tsx`: converted to a client island. Pins project + sort
  largest-first, drop in staggered (spring scale-from-0), the top-3 clusters pulse,
  and hover/tap shows a dark popover tooltip ("California — N families"). All gated
  on `useReducedMotion()`.

### Potential concerns to address:
- Community half (board filter animation, kind accent border, un-dimmed status
  pills, post hover, optimistic Resolve/Accept moment, connected-card polish) is
  NOT done yet — next commit.
- `npm install framer-motion` materialized real node_modules in the worktree; only
  package.json + lock should be committed (node_modules is gitignored).
- Validation (tsc/lint/test/build) run pending after Community work.
