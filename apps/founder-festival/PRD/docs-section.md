## Progress Update as of 2026-06-12 07:00 PM Pacific  (branch: docs-emdash)
*(Most recent updates at top)*

### Summary of changes since last update
Round of docs polish (branch `docs-emdash`, off main post-#384):
1. **Em dashes removed** from all 5 `content/docs/*.md` (51 of them) → `:` for
   definitions/lists, `,` for asides. Dev re-seeded; PROD needs a re-seed (same
   `seed-docs.ts` command) since content lives in the DB.
2. **Nav icons → React icons.** `DocsNav` now uses `react-icons/fi` (FiZap,
   FiUser, FiAward, FiSettings, FiCalendar, FiLifeBuoy + FiMenu) instead of emoji,
   via an ICONS-by-slug map (mirrors AdminNav). `DOCS_NAV.emoji` kept as metadata.
3. **Full nav header.** `/docs/layout.tsx` now renders the logo + `SiteHeaderNav`
   (like /leaderboard + /changelog); added `"docs"` to `SiteHeaderNavPage`. Layout
   is now async (calls `getCurrentViewerContext`).
4. **Diff-style suggestions + newest-first.** `listPendingSuggestions` orders
   `desc(createdAt)`. New `renderDiffHtml(oldMd,newMd)` (dep `diff` v9, `diffWords`)
   → red `.diff-del` / green `.diff-add` spans; `DocPageServer` diffs each
   proposed body against the CURRENT live body; review panel shows the diff +
   legend + date. `SuggestionView` now `{id, rationale, createdAt, diffHtml}`.

### Potential concerns to address:
- PROD content refresh requires re-running `seed-docs.ts` on prod (DB action).
  Prod doc rows are still seed-owned (no human edits yet) so it won't clobber.
- DB-backed vitest (docs/support) is flaky LOCALLY right now on Neon pooled-endpoint
  connect timeouts (non-pooled seed works); pure tests pass; CI runs them on the
  Neon test branch.
- The 2 existing prod "events" suggestions were generated against the OLD content;
  after the prod re-seed their diffs recompute against the new body — review/discard.

## Progress Update as of 2026-06-12 05:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Prod migrated + seeded successfully (ep-fragrant-surf, 5 pages). Merged latest
main and resolved conflicts: main had independently shipped the SAME
`superAdminOnly` nav mechanism (`AdminNavItem.superAdminOnly` +
`visibleNavItems(grants, {superAdmin})` + `isSuperAdmin` AdminNav prop + an
"Email options" item) and an `app_settings` table + its own 0056/0057 migrations.
Reconciled by: adding the Support nav item to `ADMIN_NAV` as `superAdminOnly:true`
(dropping my hardcoded link + duplicate `superAdmin` prop in AdminNav), keeping
both schema additions, taking main's drizzle journal, and regenerating my
migration as `0058_same_proudstar.sql` (the same 4 docs/support tables already on
prod). tsc + build + lint + 16 nav tests all green post-merge.

## Progress Update as of 2026-06-12 05:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Prod migration applied (tables created on prod ep-fragrant-surf). The prod SEED
then failed because `scripts/seed-docs.ts` imported `@/lib/docs` → `@/db`, and
`@/db` reads only `DATABASE_URL`, which is empty in `.env.prod.local` (that file
only populates `POSTGRES_URL_NON_POOLING`). Rewrote `seed-docs.ts` to be
self-contained — raw `neon()` with the same URL fallback chain as
`apply-docs-migration.ts` + a single no-clobber upsert (ON CONFLICT … WHERE
updated_by='seed') — importing only the pure `DOCS_NAV`. Re-validated on dev
(5 written). PROD seed still needs to be re-run with the fixed script.

## Progress Update as of 2026-06-12 04:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the entire `/docs` section end-to-end. Public docs at `/docs` with an
emoji left nav, DB-backed markdown pages, super-admin inline editing (floating
tray), ship-time LLM doc-update suggestions (review/publish), and claimed-user
support tickets (in-app thread + Resend email pings). tsc + eslint + build all
clean; docs/support/nav tests pass; the suggest-docs pipeline was validated
against dev (wrote real pending suggestions, then cleaned up).

### Detail of changes made:
- **Schema/migration:** `doc_pages`, `doc_page_suggestions`, `support_tickets`,
  `support_ticket_messages` (drizzle `0056_flimsy_spirit.sql`); idempotent
  `scripts/apply-docs-migration.ts`; **applied to DEV only.**
- **Seed:** `content/docs/{quickstart,profiles,leaderboard,account,events}.md`
  (public-safe, code-grounded — endorsements, family/pets, connections) +
  `scripts/seed-docs.ts` (no-clobber). DEV seeded.
- **Libs:** `src/lib/docs.ts` (CRUD + `renderMarkdown` via new `marked` dep +
  suggestions), `src/lib/docs-nav.ts` (`DOCS_NAV` + `docsActiveHref`),
  `src/lib/support.ts` (tickets + email helpers via `sendRawEmail`).
- **UI:** `src/app/docs/{layout,page,[slug]/page,support/page,support/[id]/page}`;
  `components/docs/{DocsNav,DocPageView,DocPageServer,SupportThread,SupportTicketForm}`;
  admin console `(authed)/admin/support/{page,[id]/page}`; `.docs-prose` styles in
  globals.css; AdminNav gains a super-admin-only Support link (`superAdmin` prop,
  passed from the admin layout — kept OUT of grant-gated ADMIN_NAV so its tests
  stay green).
- **APIs:** `PATCH /api/docs/[slug]`, `POST /api/docs/[slug]/suggestions/[id]`,
  `POST /api/support`, `POST /api/support/[id]/messages`, `POST /api/admin/support/[id]`.
- **Ship pipeline:** `scripts/suggest-docs.ts` + a step in `changelog-sync.yml`
  (same secrets/guards + the changelog's "no PII / no point values" rules).
- **Tests:** `tests/lib/docs-nav.test.ts`, `tests/app/docs.test.ts`,
  `tests/app/support.test.ts`.

### Potential concerns to address:
- **Prod gate:** new pages READ the 4 tables → run `apply-docs-migration.ts` +
  `seed-docs.ts` on PROD before deploy (DROdio / DB action). Not yet run on prod.
- `suggest-docs` proposes from ALL recent meaningful commits per ship head; first
  prod run may propose updates from the backlog — review before publishing.
- Support email round-trip is outbound-only (in-app replies); inbound email
  threading still needs reply.festival.so MX + Resend Inbound (out of scope here).

## Progress Update as of 2026-06-12 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Kicked off the `/docs` documentation section. Brainstormed + wrote the design
spec (`docs/superpowers/specs/2026-06-12-docs-section-design.md`). Three decisions
locked with DROdio: auto-update = draft suggestions you publish (no clobber);
support = in-app thread + email pings (no inbound MX needed); docs are public-read
(edit = super-admin, file ticket = claimed users only). Building it all out while
DROdio is away.

### Detail of changes made:
- Spec only so far. Implementation plan + code next.
- Architecture: public top-level `src/app/docs/` route group; DB-backed markdown
  pages (`doc_pages`), ship-time LLM suggestions (`doc_page_suggestions`), support
  tickets (`support_tickets` + `support_ticket_messages`).
- Reuses: admin-nav pattern for the docs left nav; `AdminProfileActions` floating
  tray for the super-admin inline edit; `sendRawEmail` for ticket emails; the
  `changelog-sync.yml` ship job for the docs-suggestion step.

### Potential concerns to address:
- Prod DB: 3 new tables + a seed must run on prod BEFORE deploy (new pages read
  them). Idempotent `apply-docs-migration.ts` + `seed-docs.ts`; prod run needs
  DROdio (DB action).
- Auto-suggestion pipeline shares the changelog's AI-Gateway secret + prod DB URL
  in CI; no-ops without them. Must inherit the same "no PII / no point values /
  public-friendly" hard rules.
- `marked` is a new dependency (pnpm). Content is super-admin-authored/trusted,
  but render path should still avoid injecting untrusted HTML.
