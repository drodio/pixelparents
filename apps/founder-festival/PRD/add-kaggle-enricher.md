## Progress Update as of 2026-06-10 11:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Added a Kaggle enricher (data-science / ML credibility) end-to-end, and
provisioned the `KAGGLE_API_TOKEN` in `.env.local` + Vercel.

### Detail of changes made:
- **Token / auth:** Kaggle's newer `KGAT_…` token authenticates as a **Bearer** token
  standalone — no classic `username`+`key` pair needed (verified: also works as Basic
  password with empty username). Stored as `KAGGLE_API_TOKEN`.
  - `.env.local`: added. Vercel: added to **Production + Development**. **Preview is
    still missing** — the pinned Vercel CLI (53.1.0) loops on the non-interactive
    "all Preview branches" path (returns `action_required: git_branch_required` even
    with `--value --yes --force`). Add Preview via the dashboard or after upgrading
    the CLI. The enricher no-ops gracefully without the token, so preview builds don't break.
- **API client `src/lib/kaggle.ts`:** `listUserDatasets(user)` + `listUserKernels(user)`
  against `https://www.kaggle.com/api/v1` (`/datasets/list?user=` + `/kernels/list?user=`).
  No public "user profile / tier" endpoint exists, so reputation is derived from
  published items (count, votes, downloads) and identity from each item's creator/author.
- **Enricher `src/lib/enrichers/kaggle.ts`:** mirrors the HuggingFace pattern. Identity
  precision-first: (1) trusted `kaggle.com/<username>` URL from Exa → accept; (2) else
  probe `deriveHandleCandidates` and accept ONLY when a returned dataset's `creatorName`
  / notebook's `author` `nameOverlaps` the subject. Emits ≤3 facts (counts, votes+
  downloads summary, top item). NO point disclosure in facts.
- **Wiring:** `EnrichmentResult.source` += `"kaggle"`; `extractKnownUrls` += `kaggle`
  bucket + `kaggle.com` matcher; registered in `ENRICHERS`; waterfall gets a new
  `EVAL_STEPS` line ("Checking Kaggle for datasets and notebooks…") + `HOST_TO_STEP`
  (`kaggle.com` → "Kaggle") + `PLATFORM_TO_STEP` (`kaggle` → "Kaggle").
- **Rubric:** new KAGGLE SUB-RULES block in `scoring-rubric.ts` (author +3 once;
  upvote tiers +3/+8/+15). Scoring doc bumped to v0.0.23.
- **Tests:** `tests/lib/kaggle.test.ts` (handle extraction) + `EXPECTED_SOURCES` updated.
  tsc clean; registry + kaggle tests pass. Live-verified facts on a real author
  (20 datasets / 50 notebooks / 9.2k upvotes).

### Potential concerns to address:
- **Preview env var not set** (CLI limitation, above) — low impact, but worth a manual add.
- Kaggle's API has no competition-ranking / Grandmaster-tier endpoint, so the signal is
  datasets+notebooks reputation only (not competition medals). Acceptable; could add the
  profile-page scrape later if competition tier proves valuable.
- Derived-handle probing makes up to 4×2 API calls when no profile URL is known; bounded
  and fast (~200ms each) but watch the per-eval latency budget if more probing sources are added.
