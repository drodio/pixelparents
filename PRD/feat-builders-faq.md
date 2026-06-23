# feat/builders-faq

## Progress Update as of June 22, 2026 — 5:42 PM Pacific

### Summary of changes since last update
Added a "Frequently Asked Questions" section to `builders.md` (rendered at `/builders`),
placed below the "How to get involved as a Pixel Parent Builder" section.

### Detail of changes made:
- `builders.md`: appended a `## Frequently Asked Questions` heading with three Q/A
  pairs formatted as bullet-list cards (the markdown renderer in
  `app/builders/markdown.tsx` styles `<li>` as cards and `<strong>` as white text,
  so each card uses a bold `Q:` line followed by an `A:` paragraph).
- The first FAQ links to the "Vibe Coding" book by Gene Kim and Steve Yegge using
  the user-supplied affiliate URL `https://amzn.to/3QXlHnR`.
- Build verified clean (`npm run build`).

### Potential concerns to address:
- None. Pure content change; no code/logic touched.
