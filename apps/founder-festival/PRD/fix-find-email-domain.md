## Progress Update as of 2026-05-31 09:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Hotfix for Find Email returning "Found 0" in prod. Root cause: the route called
AnyMailFinder with full_name + linkedin_url and NO domain, which AMF rejects with
HTTP 400 ("provide a valid domain or company_name") — so every profile was a miss.

### Detail of changes made:
- `src/app/api/admin/profiles/find-email/route.ts`: select primaryCompanyDomain from
  the evaluations.profile JSONB; look up by full_name + domain (reliable). Fall back to
  linkedin_url ALONE only when no domain (stored linkedin_urls are unreliable — some
  resolve to the wrong person). No domain + no linkedin => miss.
- Verified against real prod data: 4/5 selected resolve (garry@ycombinator.com,
  ronen@run.ai, dan@peoplereign.io, elizabeth@hustlefund.vc); Michael Michael has no domain.
- Branched off current main to avoid squash-merge divergence from email-related-work.

### Potential concerns to address:
- `vercel env pull` redacts sensitive vars (ANYMAILFINDER_API_KEY, DATABASE_URL show
  empty on pull) — they ARE set at runtime. Don't diagnose key presence via pull.
- Many stored linkedin_urls are wrong/mismatched; domain lookup sidesteps it.
