## Progress Update as of June 30, 2026 — 12:03 AM Pacific

### Summary of changes since last update
First entry. Implemented per-enricher STATUS visibility (every source now reports
`ok` / `no_api_key` / `no_data` / `error` and ALL are surfaced instead of empties
being dropped), added **personal website** as a first-class, self-entered profile
link, and added a new keyless **website-scraper enricher** that extracts
title/description/headings/snippet/socials. Wired statuses + website through the
eval pipeline, persisted them on the profile, and rendered a "Data sources" roster
on the profile page.

### Detail of changes made:
- **Status model** (`src/lib/enrichers/types.ts`): extended `EnrichmentResult`
  with optional `status` + `note`; added `EnrichmentStatus`, `EnrichmentStatusEntry`,
  and pure helpers `deriveStatus()` (facts → "ok", else "no_data" when unset) and
  `toStatusEntry()`. Added `"website"` to the source union; added `websiteUrl` to
  `EnricherContext`.
- **Registry** (`src/lib/enrichers/index.ts`): `runRegistry()` now KEEPS every
  result and returns `{ enrichments, okEnrichments, statuses, exaUsage }`. Only
  `okEnrichments` feed downstream; `renderEnrichmentsForPrompt()` filters to `ok`.
  `withEnricherTimeout` now resolves a timeout/rejection to a KEPT `status:"error"`
  result (with a note) instead of a silently-dropped empty. Registered the website
  enricher; threaded `websiteUrl` through `RunEnrichmentsArgs` / `runEnrichments`.
- **Key-gated enrichers** now return FAST with `status:"no_api_key"`,
  `note:"API key not set"` when their REQUIRED credential is missing: producthunt,
  kaggle, patents, brightdata, google-kg, youtube, librariesio. (github/stackoverflow/
  huggingface keys are OPTIONAL → never emit no_api_key. bd-async datasets emit
  cached facts → no_data when empty.)
- **Website enricher** (`src/lib/enrichers/website.ts`, NEW): keyless; picks the
  self-entered `ctx.websiteUrl` first, else the first non-platform URL discovered on
  the LinkedIn/identity surface. Fetches homepage + best-effort `/about` via
  `fetchWithTimeout` with a 512KB byte cap and 6s per-page deadline. Pure extractors
  (title/meta/headings/visible snippet/social links) are exported + unit-tested.
  Status: no-url → no_data ("no website URL"); unfetchable → no_data; nothing usable
  → no_data; facts → ok; throw → error.
- **Pipeline** (`src/lib/eval-pipeline.ts`): `ResearchInputs` + scored `ScoredPayload`
  now carry `enrichmentStatuses`; persisted to `profile.enrichmentStatuses` (array of
  `{source,status,note,factCount}`) alongside the existing `profile.enrichments`.
  `researchSubject` / `computeFreshScore` accept an optional `websiteUrl`;
  `reEvaluate` loads the claimed user's `users.websiteUrl` (best-effort) and threads
  it in so a re-score after the user adds their site picks it up.
- **Storage**: added `users.website_url` column (`src/db/schema.ts` + migration
  `drizzle/0066_add_users_website_url.sql`, additive, no backfill). Validator
  `validateWebsiteUrl()` (http/https, bare-host→https normalize, 2048-char cap) in
  `profile-slug-validate.ts`.
- **Edit flow**: `/api/account/profile-settings` reads/validates/writes `websiteUrl`;
  `ProfileSettingsSection.tsx` adds a "Personal website" input; `account/page.tsx`
  loads it into the editor `initial`.
- **Display**: profile heading shows a globe link (`ProfileWebsiteLink.tsx`, FiGlobe)
  next to the LinkedIn icon (owner-grade claims only). New `EnrichmentSourcesSection.tsx`
  renders the full source roster with status icons (FiCheckCircle/FiKey/FiMinusCircle/
  FiAlertTriangle) using react-icons — reads `profile.enrichmentStatuses`, falls back to
  deriving from `profile.enrichments[]` for legacy rows. Super-admin `ScoreDetail.tsx`
  gained a "Source statuses" subsection.
- **Tests**: new `website-enricher.test.ts`, `enrichment-status.test.ts`; extended
  `enricher-registry.test.ts` (keep-all + status + no_api_key cases),
  `enricher-timeout.test.ts` (error-status contract), `profile-slug-edit.test.ts`
  (validateWebsiteUrl). All touched/new pure-function suites pass (67 in the focused
  run). Full `pnpm test`: 913 passing; the only individual failures are the 5
  pre-existing hn-tokenmaxxing external-API flakes. The many whole-file failures are
  the pre-existing no-DATABASE_URL import issue (identical on `main`).

### Potential concerns to address:
- The website enricher only runs on a re-score path that has a `websiteUrl` (claimed
  user's self-entered value, or one discovered in LinkedIn text). On a first score of
  an unclaimed subject with no discoverable site it correctly reports `no_data` —
  expected, but worth noting it won't add website facts until the user claims + sets it.
- `extractKnownUrls` was NOT extended with a `website` bucket; the website enricher
  scans `searchHighlights`/`linkedinPageText` itself for a non-platform URL. Fine, but
  a future refactor could centralize discovery there.
- `profile.enrichmentStatuses` is only written on `scored` payloads (not low-signal),
  matching the existing `enrichments` persistence. The UI section no-ops when absent.
- The "Data sources" roster is visible to all viewers (source names + statuses only,
  no PII). If product wants it owner/admin-only, gate it on `isOwner || isAdminViewer`.
