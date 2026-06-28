## Progress Update as of 2026-06-08 12:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Reworked the dynamic Open Graph / social unfurl card (`/api/og`). The hero number is now the combined **Festival Score** + its percentile; the name is large and gold with "Festival Score" as smaller white text beneath it; and the footer now shows the founder and investor scores instead of "Combined".

### Detail of changes made:
- `src/app/api/og/route.tsx`:
  - Hero number changed from the dominant-dimension score to the **combined** score (`row.score`), with the percentile computed via `computePercentile(combined, "combined")`.
  - Name (`{fullName}'s`) is now large gold (fontSize 72, `#dfa43a`, bold); the label beneath reads "Festival Score" in smaller white (fontSize 40, `#e4e4e7`) — a flip of the previous name=white / label=gold styling, and renamed from "FounderScore"/"InvestorScore".
  - Footer right side replaced "Combined: N" with "Founder: N   Investor: N".
  - Removed the now-unused dominant-dimension logic (`isInvestor`/`dimScore`/`label`).
- Verified by rendering the PNG locally against a dev eval (1200×630, 200 OK).

### Potential concerns to address:
- The hero number uses fontSize 260 in a flex row with the percentile. Real prod combined scores are 2–3 digits and fit comfortably (matches the prior card), but a 4–5 digit combined score (only seen in the inflated dev DB) can push the percentile off the right edge. If prod scores ever grow that large, switch the number to shrink-to-fit or stack the percentile.
