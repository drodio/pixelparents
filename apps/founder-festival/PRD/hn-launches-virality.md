## Progress Update as of 2026-06-06 (afternoon) Pacific
*(Most recent updates at top)*

### Summary
Deepened the HN enricher: Show HN launches + front-page (100+ pt) virality, from the
stories already fetched (no extra API call). New HN sub-rules score both.

### Detail
- `enrichers/hackernews.ts` — `hnLaunchFacts(stories)` (pure, exported): Show HN
  count/strength + top, and count of 100+ pt (front-paged) posts.
- `scoring.ts` — Show HN → +4 (+8 if 50+ pts) [Technical Depth]; front-page 1/2-4/5+
  → +3/+6/+10 [GTM]. Findings nest under the existing HN waterfall step.
- `tests/lib/hn-launch-facts.test.ts` (4). Rescore-to-apply.
