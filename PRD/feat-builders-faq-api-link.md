# feat/builders-faq-api-link

## Progress Update as of June 22, 2026 — 5:48 PM Pacific

### Summary of changes since last update
Two FAQ tweaks on `/builders`: linked "developer APIs" to the `/developers` API page,
and made the emphasized word "them" render as true italics (normal text color) instead
of the muted gray that the markdown renderer applies to `<em>`.

### Detail of changes made:
- `builders.md`: changed `developer APIs` → `[developer APIs](/developers)` in the
  third FAQ answer. `/developers` is the Pixel Parents API page (same target as the
  builders footer's "Explore the Pixel Parents API →" link).
- `app/builders/markdown.tsx`: the global `em` component renders emphasis as
  `not-italic text-white/50` (a deliberate muted look used by the subtitle and the
  `_builder_` word). To make `_them_` in the FAQ render as real italics in the normal
  text color WITHOUT disturbing those, added `[&_em]:!italic [&_em]:!text-white/70`
  to the `li` (card) component. The `!important` modifiers override the muted `em`
  styling (and the `p`'s `[&>em]:text-white/50`) for any emphasis inside a list/FAQ
  card only. Subtitle and "builder" (both inside `<p>`, not list items) are unchanged.
- Build verified clean.

### Potential concerns to address:
- The `[&_em]` override applies to ALL emphasis inside any list-item card on
  `/builders`, not just "them". Today the only such emphasis is "them", so there is
  no visible side effect; future card emphasis would also render italic/normal-color.
