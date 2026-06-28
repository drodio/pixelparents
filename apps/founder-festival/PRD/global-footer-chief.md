## Progress Update as of 2026-06-10 11:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a quiet global footer to every page: "Festival's intelligence is powered by Chief", where Chief links to https://Chief.bot. Deliberately understated — same small gray treatment as the "Have an invite code?" link, and the Chief link stays gray (not gold) so it reads as a credit, not a CTA.

### Detail of changes made:
- New `src/components/SiteFooter.tsx` (server component): `text-xs text-zinc-500`, centered, `mt-auto py-6`; Chief is a gray link (`text-zinc-500`, dotted underline, `hover:text-zinc-300`, target=_blank rel=noopener).
- `src/app/layout.tsx`: render `<SiteFooter />` after `{children}` in the root layout so it appears on every page. Body is already `min-h-full flex flex-col`, so `mt-auto` pins the footer to the bottom.

### Potential concerns to address:
- Footer renders on every route that uses the root layout (i.e. all pages). It does NOT appear on API/OG-image routes, which don't use the layout — expected.
