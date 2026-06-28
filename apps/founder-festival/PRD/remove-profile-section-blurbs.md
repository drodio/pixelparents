## Progress Update as of 2026-05-28 02:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed two descriptive blurbs under section headings on the profile page: the Founder/Investor Matrix "Five … most like you …" text and the Credibility "Depth across five vectors …" text. The section headings remain.

### Detail of changes made:
- `src/components/FounderMatrix.tsx`: deleted the `<p>` under the matrix `<h3>` ("Five {dimension}s most like you, complementary to you, and least like you — … Tap any pill to jump into their profile."). `dimension` is still used in the title, so no unused vars.
- `src/app/(authed)/profile/page.tsx`: deleted the `<p>` under the "Credibility" `<h3>` ("Depth across five vectors, percentile-ranked … Tap any vector for the evidence behind it.").

### Potential concerns to address:
- Pre-existing ESLint issues remain in `profile/page.tsx` (~lines 455-456: `<a href="/">` should be `<Link>`, and an `<img>` warning) — not introduced by this change.
