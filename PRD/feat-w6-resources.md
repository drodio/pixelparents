## Progress Update as of [June 30, 2026 — 2:03 PM Pacific]

### Summary of changes since last update
First entry. Built the full **Resources** feature — the "living library": any
verified OHS member shares a learning resource (link + title + short note) that
students/parents should learn from, and each resource is auto-labeled with 2-5
topic tags via the Vercel AI Gateway (with a heuristic fallback that NEVER blocks
a submission). The library is its own dashboard tab (verified-OHS-gated, mirroring
Community/Directory/Events), browsable newest-first and filterable by topic tag
using the shared `<TagList>` "+N more" component. Author names follow the same
privacy coarsening as the directory/board (students show first name only). All
gates pass: 503/503 unit tests, `tsc --noEmit` clean, `eslint` clean, and the
production `next build` succeeds (verified via the copy-into-main-checkout dance
because Turbopack rejects this worktree's symlinked node_modules).

### Detail of changes made:
- **Data model + data layer** — NEW `lib/db/resources.ts`: a `resources` table
  (id uuid, author_signup_id uuid, author_clerk_id text, title text, url text,
  note text, tags text[], created_at timestamptz). Self-heal DDL is SELF-CONTAINED
  here (its own memoized `ensureResourcesTable`, all idempotent DDL in ONE neon
  `sql.transaction` — CREATE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS +
  created_at DESC index + GIN index on tags), NOT in the shared `lib/db/ensure.ts`
  (the country-column P0 / sibling-`drizzle-kit push`-drops-orphan lesson). Mirrors
  `lib/db/reports.ts`. Every read/write calls the ensure first. Functions:
  `createResource`, `listResources({tags?, limit?})` (newest-first, `tags @>`
  filter), `listResourceTags` (distinct tags + counts via `unnest`),
  `countResourcesByAuthorSince` (rate-limit), `deleteResource` (scoped-WHERE
  owner authz → no-op for non-owners). Uses raw `getSql()` tagged templates;
  text[] passed as a JS array with an explicit `::text[]` cast (verified
  round-trip through the neon HTTP driver). camelCase `mapRow` from snake_case.
- **AI auto-label + validators** — NEW `lib/resources-label.ts` (pure, DB-free):
  - `autoLabelResource(r, model?)` — generates 2-5 lowercase topic tags via the
    Vercel AI Gateway (`VERCEL_AI_GATEWAY`/`AI_GATEWAY_API_KEY`, model
    `ENRICHMENT_MODEL` || `anthropic/claude-haiku-4-5`), falling back to a direct
    Anthropic call (`ANTHROPIC_API_KEY`). Mirrors `lib/enrichment/info-extract.ts`
    exactly (lazy env reads, OpenAI-compat chat endpoint, injectable `ModelCall`
    for tests). DESIGNED NEVER TO THROW and never to block a share: no key / AI
    failure / junk output → heuristic fallback; a too-short AI result is padded
    from the heuristic up to the 2-tag floor; always caps at 5.
  - `heuristicTags` — deterministic curated subject→tag matcher (math, science,
    coding, college-prep, …), always returns ≥1 tag ("resource" fallback).
  - validators `validateResourceTitle` / `validateResourceUrl` (http(s)-only —
    rejects javascript:/data:/mailto:/file: and host-less URLs; upgrades a
    scheme-less host to https://) / `validateResourceNote` (optional);
    `normalizeResourceTags` (lowercase, dedupe, trim, per-tag + count caps);
    `filterByTag` (pure browse-by-topic, shared with the client list).
- **Route + UI** — NEW `app/(authed)/resources/`:
  - `page.tsx` — server component. Signed-out → grayed shell + `SignedOutPanel`
    BEFORE any DB read (no PII). Verified-OHS gate (mirrors Community: unverified
    → verify/join prompt). Loads `listResources` + `listResourceTags`, batch-
    resolves author display names with directory coarsening (`isStudentAccount`
    → first name only; parents → full name), passes plain card data to the client.
  - `resources-client.tsx` — "Share a resource" form (title, link, optional note;
    tags auto-generated server-side), a tag-filter chip strip built on `<TagList>`
    (All + per-tag counts, client-side filter via `filterByTag`), and the
    newest-first browsable list. Each card: external link (rel="noopener noreferrer
    nofollow"), host, note, its `<TagList>` chips, coarsened author + date, and an
    owner-only delete (confirm + scoped server action).
  - `actions.ts` — `"use server"`. `createResourceAction` / `deleteResourceAction`
    authorize ENTIRELY server-side via `verifiedCaller()` (Clerk session →
    primaryEmail → signup → `isFamilyVerified`; identity never client-supplied),
    validate/sanitize inputs, rate-limit (10/hr/author), auto-label (best-effort),
    `revalidatePath("/resources")`. Delete is owner-scoped in the DB WHERE.
- **Nav + icon** — `components/dashboard-shell.tsx`: added the **Resources** tab
  (NEW `IconBook`) right after Directory; gates like the rest at the route level.
  `components/icons.tsx`: NEW `IconBook` (open-book), following the 24×24 stroke
  convention. (Not added to `MOBILE_PRIMARY_HREFS` — it lives in the "More"
  drawer on phones, alongside Family/Developers, since the bottom bar holds 4.)
- **Tests** — NEW `lib/resources-label.test.ts`: 32 tests covering the validators
  (incl. the URL allowlist rejecting XSS/exfil schemes), tag normalization (the
  shaping the data layer stores), the heuristic labeler, `autoLabelResource`
  fallback behavior (no key → no model call → heuristic; mocked-model: valid tags,
  prose/fence tolerance, junk → heuristic, throw → heuristic, pad-to-min, cap-to-
  max), and `filterByTag` (the tag filter). Data-layer DB functions were
  additionally smoke-tested against live Neon (create with text[], newest-first,
  `tags @>` filter, tag counts, rate-limit count, scoped delete) and the temp
  script removed.

### Potential concerns to address:
- **Build verification is indirect.** Turbopack panics on this worktree's
  symlinked `node_modules` ("Symlink ... points out of the filesystem root"), so
  `npm run build` here always fails. I verified the build by copying the new/
  changed files into the main checkout (`/Users/main/stanfordohs/pixelparents`,
  real node_modules), running a clean `next build` (success; `/resources` shows in
  the route manifest as ƒ dynamic), then restoring that checkout to pristine. CI/
  Vercel build on a normal checkout is unaffected.
- **AI tags depend on a key being present in prod.** With no `VERCEL_AI_GATEWAY`/
  `ANTHROPIC_API_KEY`, every resource gets heuristic tags only — functional but
  coarser. This is intentional (submission must never block), just worth knowing.
- **Tag filtering is client-side** over the already-loaded list (capped at 200
  newest). Fine while the library is small; if it grows large, move filtering to
  the server (the data layer already supports `listResources({ tags })` + a GIN
  index, so it's a small change).
- **No edit flow in v1** — authors can delete + re-share but not edit a resource
  in place (keeps the surface minimal). Easy follow-up if requested.
- **No dedupe of identical URLs** — two members can share the same link. Could add
  a soft "already shared" hint later; not blocking.
