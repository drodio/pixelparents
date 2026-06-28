## Progress Update as of 2026-06-10 9:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
ScoreTable now hides a founder/investor dimension entirely when it has no signals (no score items) — e.g. an investor-less founder shows only the "Founder score" section, no empty "Investor score" header.

### Detail of changes made:
- `src/components/ScoreTable.tsx`: each `<Section>` is gated on `founder.length > 0` / `investor.length > 0`.

### Potential concerns to address:
- An owner with zero items in a dimension can't add to it from the (now hidden) section; acceptable per the request.
