## Progress Update as of 2026-06-07 Pacific

### Summary
New [youtube] enricher (YouTube Data API v3, GOOGLE_API_KEY). Talk/media reach by
view count. DROdio enabled the API.

### Detail
- `enrichers/youtube.ts` — search + videos:statistics. Company-corroboration gate
  (only count videos mentioning a subject company token; skip if no company). Pure
  companyTokensFor/corroborateVideos/youtubeFacts (tested). Live: a famous chip-company
  CEO ~25.1M corroborated views.
- `scoring.ts` — top video 10k/100k/1M+ -> +3/+6/+10 [GTM]. Waterfall step + youtube.com
  host. Quota: 100 units/search (~100 evals/day). Rescore-to-apply.
