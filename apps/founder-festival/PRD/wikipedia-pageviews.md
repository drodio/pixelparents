## Progress Update as of 2026-06-06 (afternoon) Pacific

### Summary
Wikipedia enricher now fetches avg monthly pageviews (Wikimedia REST, keyless) →
notability MAGNITUDE tier, distinct from the binary "has a page" +5.

### Detail
- `enrichers/wikipedia.ts` — `fetchMonthlyPageviews` (trailing ~12mo) + pure
  `pageviewsFact`. e.g. Jensen Huang ~238k/mo.
- `scoring.ts` — pageview tier 1k/10k/50k → +3/+6/+12 [Domain Expertise].
- `tests/lib/wikipedia-pageviews.test.ts` (2). Rescore-to-apply.
