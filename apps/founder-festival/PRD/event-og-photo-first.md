# PRD — event-og-photo-first

## Progress Update as of 2026-06-06 06:35 PM Pacific
*(Most recent updates at top)*

### Summary
Follow-up to #240: the event social-card image now prefers the first PUBLIC
recap photo OVER the Luma cover. Many Luma covers (incl. the Swapnil event) are
just the FF logo, so #240 (cover-first) still showed the logo. Now: first public
recap photo → else cover → else nothing.

### Detail
- `events/[slug]/page.tsx` generateMetadata: `ogImage = firstPublicRecapPhoto ?? event.coverUrl`.

### Verification
- `next build` green. (Upcoming events with no photos still fall back to cover.)
