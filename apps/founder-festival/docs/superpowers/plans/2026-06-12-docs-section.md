# Founder Festival `/docs` Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public markdown docs site at `/docs` with an admin-style emoji left nav, super-admin inline editing, claimed-user email-backed support tickets, and a ship-time LLM that drafts doc-update suggestions for super-admin review.

**Architecture:** Public top-level `src/app/docs/` route group. Docs content lives in a `doc_pages` DB table (markdown source of truth), seeded from `content/docs/*.md`. Super-admin inline edits PATCH the row. A ship-time script writes `doc_page_suggestions` (pending) that a super-admin publishes. Support tickets (`support_tickets` + `support_ticket_messages`) are filed by claimed users and answered in-app, with Resend email pings both directions.

**Tech Stack:** Next.js 16 App Router (server components), Drizzle + Neon, Clerk, Resend (`sendRawEmail`), `marked` (new dep) for markdown→HTML, AI Gateway Haiku (suggestions), Tailwind. pnpm only.

---

## File structure

- `src/db/schema.ts` — append `docPages`, `docPageSuggestions`, `supportTickets`, `supportTicketMessages`.
- `scripts/apply-docs-migration.ts` — idempotent `CREATE TABLE IF NOT EXISTS` (mirror `apply-org-badges-migration.ts`).
- `scripts/seed-docs.ts` — load `content/docs/*.md` → `doc_pages` (no-clobber).
- `content/docs/{quickstart,profiles,leaderboard,account,events}.md` — seed content.
- `src/lib/docs-nav.ts` — `DOCS_NAV` data + `docsActiveHref` (mirror `admin-nav.ts`).
- `src/lib/docs.ts` — all DB reads/writes + `renderMarkdown`.
- `src/lib/support.ts` — ticket DB ops + email helpers.
- `src/components/docs/DocsNav.tsx` — client left nav (mirror `AdminNav.tsx`).
- `src/components/docs/DocPageView.tsx` — client: render + super-admin edit tray + suggestion review.
- `src/components/docs/SupportTicketForm.tsx`, `SupportThread.tsx` — client.
- `src/app/docs/layout.tsx`, `page.tsx`, `[slug]/page.tsx`, `support/page.tsx`, `support/[id]/page.tsx`.
- `src/app/(authed)/admin/support/page.tsx`, `[id]/page.tsx` + `AdminSupportThread.tsx`.
- `src/app/api/docs/[slug]/route.ts` (PATCH), `src/app/api/docs/[slug]/suggestions/[id]/route.ts` (POST publish/discard).
- `src/app/api/support/route.ts` (POST file), `src/app/api/support/[id]/messages/route.ts` (POST reply), `src/app/api/admin/support/[id]/route.ts` (POST close/reopen).
- `scripts/suggest-docs.ts` + a step in `.github/workflows/changelog-sync.yml`.
- `tests/app/docs.test.ts`, `tests/app/support.test.ts`, `tests/app/docs-nav.test.ts`.

---

## Task 1: Schema + migration

**Files:** Modify `src/db/schema.ts`; Create `scripts/apply-docs-migration.ts`; generate drizzle migration.

- [ ] Append 4 tables to `schema.ts` per spec (doc_pages, doc_page_suggestions, support_tickets, support_ticket_messages) with the indexes/uniques listed. Use `text` for status fields (no enums), `uuid` PKs `defaultRandom()`, tz timestamps.
- [ ] Write `scripts/apply-docs-migration.ts` mirroring `scripts/apply-org-badges-migration.ts` (URL fallback chain incl. `POSTGRES_URL_NON_POOLING`; `CREATE TABLE IF NOT EXISTS` + `CREATE [UNIQUE] INDEX IF NOT EXISTS` for all 4 tables; prints target host).
- [ ] `pnpm db:generate` → new migration file. Apply to dev: `DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/apply-docs-migration.ts`. Expected: prints `ep-old-shadow…` host, "Done."
- [ ] Commit.

## Task 2: Docs nav data + test

**Files:** Create `src/lib/docs-nav.ts`, `tests/app/docs-nav.test.ts`.

- [ ] `DOCS_NAV: { slug, label, emoji, href }[]` in order: quickstart 🚀, profiles 👤, leaderboard 🏆, account ⚙️, events 📅 (these are `kind:"doc"`); support 💬 (`kind:"support"`, href `/docs/support`). Export `docsActiveHref(pathname, hrefs)` copied from `admin-nav.ts:activeNavHref` + `isActiveNav`.
- [ ] Test: `docsActiveHref("/docs/profiles", hrefs)` → `/docs/profiles`; `/docs/support/abc` → `/docs/support`; `/docs` → `/docs` (quickstart index href is `/docs`). Run `npx vitest run tests/app/docs-nav.test.ts`. Commit.

## Task 3: Docs lib (`src/lib/docs.ts`) + marked

**Files:** Create `src/lib/docs.ts`; add `marked`; `tests/app/docs.test.ts`.

- [ ] `pnpm add marked` (verify it installs; pnpm only).
- [ ] `renderMarkdown(md: string): string` — `marked.parse(md, { gfm: true, async: false })`. (Content trusted; no untrusted HTML injected.)
- [ ] DB ops: `getDocPage(slug)`, `listDocPages()`, `updateDocPage(slug, bodyMd, clerkUserId)` (sets `updated_at=now`, `updated_by`), `pendingSuggestionCount(slug)`, `listPendingSuggestions(slug)`, `upsertSuggestion({slug, proposedMd, rationale, sourceCommit})` (onConflictDoNothing on `(slug, source_commit)`), `publishSuggestion(id)` (copy `proposed_md`→page `body_md`, set page `updated_by='suggestion'`, suggestion `status='published'`, `resolved_at`), `discardSuggestion(id)`.
- [ ] Tests (skipIf IS_PROD_DB): publishSuggestion copies proposed_md into the page body + flips both statuses; discard flips status only; updateDocPage round-trips. Run vitest. Commit.

## Task 4: Seed content + seed script

**Files:** Create `content/docs/*.md` (5), `scripts/seed-docs.ts`.

- [ ] Write the 5 markdown files with real, public-safe prose per the spec's "Seed content" section (Quickstart, Profiles incl. Endorsements subsection, Leaderboard, Account incl. family/partner/pets + why, Events incl. connecting). No specific scoring point values. Cross-link with relative `/docs/...` links.
- [ ] `scripts/seed-docs.ts`: for each `DOCS_NAV` doc item, read `content/docs/<slug>.md`, upsert `doc_pages` (title/emoji/nav_order from DOCS_NAV) **only if** row absent OR `updated_by='seed'` (no-clobber of human edits). Idempotent. URL fallback chain like the migration script.
- [ ] Run against dev. Verify rows: `SELECT slug,title FROM doc_pages`. Commit.

## Task 5: Docs framework (layout, nav, page render)

**Files:** Create `src/components/docs/DocsNav.tsx`, `DocPageView.tsx`; `src/app/docs/layout.tsx`, `page.tsx`, `[slug]/page.tsx`.

- [ ] `DocsNav.tsx` (client) — mirror `AdminNav.tsx`: desktop fixed left `<aside>`, mobile top-bar + slide-in drawer; emoji as text span before label; active = white, else gold. Props: `pathname`-derived active via `docsActiveHref`.
- [ ] `layout.tsx` (public, force-dynamic) — logo header like `/changelog`, `<DocsNav/>` + children; `mx-auto max-w-3xl` body.
- [ ] `DocPageView.tsx` (client) — props `{ slug, title, html, bodyMd, canEdit, pendingCount }`; renders `dangerouslySetInnerHTML` in a prose wrapper; shows the super-admin floating tray (Edit / Review N) only when `canEdit`. (Edit + review wired in Tasks 6–7; stub the buttons now.)
- [ ] `page.tsx` → load `getDocPage("quickstart")`, render `DocPageView`. `[slug]/page.tsx` → validate slug ∈ DOCS_NAV docs, `getDocPage`, else `notFound()`. Compute `canEdit = await isSuperAdmin()`, `pendingCount`.
- [ ] Verify dev: `/docs` and `/docs/profiles` render. Commit.

## Task 6: Super-admin inline edit

**Files:** Create `src/app/api/docs/[slug]/route.ts`; extend `DocPageView.tsx`.

- [ ] `PATCH /api/docs/[slug]` — `requireGrant`/`isSuperAdmin()` gate (403 else); body `{ bodyMd }`; `updateDocPage(slug, bodyMd, userId)`; return ok.
- [ ] `DocPageView` edit mode: Edit → swap rendered body for a full-height `<textarea>` seeded with `bodyMd` + Save/Cancel. Save → PATCH → `router.refresh()`. (Live preview optional; out of scope.)
- [ ] Verify dev as super-admin: edit a page, save, reload — persists. Commit.

## Task 7: Suggestion review UI + API

**Files:** Create `src/app/api/docs/[slug]/suggestions/[id]/route.ts`; extend `DocPageView.tsx`; pass suggestions from page.

- [ ] `POST /api/docs/[slug]/suggestions/[id]` — super-admin gate; body `{ action: "publish"|"discard" }`; calls `publishSuggestion`/`discardSuggestion`; ok.
- [ ] Page passes `listPendingSuggestions(slug)` to `DocPageView`; "Review N" opens a panel listing each suggestion (rationale + rendered proposed_md) with Publish/Discard → POST → refresh.
- [ ] Verify with a hand-inserted dev suggestion row: review → publish copies into page. Commit.

## Task 8: Support — lib + file API + form

**Files:** Create `src/lib/support.ts`; `src/app/api/support/route.ts`; `src/components/docs/SupportTicketForm.tsx`; `src/app/docs/support/page.tsx`; `tests/app/support.test.ts`.

- [ ] `src/lib/support.ts`: `createTicket({evaluationId, clerkUserId, email, body})` (insert ticket + first `user` message, subject = first line ≤80 chars or "Support request"), `listMyTickets(evaluationId)`, `getTicket(id)`, `listMessages(id)`, `addMessage(id, authorType, body)` (bumps ticket `updated_at`), `setStatus(id, status)`. Email helpers: `emailAdminNewTicket(ticket, origin)` → `sendRawEmail` to `drodio@festival.so` linking `/admin/support/<id>`; `emailUserReply(ticket, origin)` → to filer email linking `/docs/support/<id>`; `emailAdminUserReply(ticket, origin)` → to drodio. Escape user content (`escapeHtml`).
- [ ] `POST /api/support` — resolve `getViewerEvaluationId()` (403 if null = unclaimed); resolve filer email server-side; `createTicket`; `emailAdminNewTicket`; return `{ id }`.
- [ ] `SupportTicketForm` (client) — single `<textarea>` + submit → POST → route to `/docs/support/<id>`. Unclaimed/logged-out: render a "claim your profile to get support" prompt + `/claim` link instead (server decides which to render).
- [ ] `/docs/support/page.tsx` — claimed: form + `listMyTickets` list; else prompt.
- [ ] Tests (skipIf IS_PROD_DB): createTicket makes ticket+message+subject; addMessage bumps updated_at; file path requires evaluationId. Commit.

## Task 9: Support — user thread + reply API

**Files:** Create `src/app/docs/support/[id]/page.tsx`, `src/components/docs/SupportThread.tsx`, `src/app/api/support/[id]/messages/route.ts`.

- [ ] `POST /api/support/[id]/messages` — body `{ body }`; authorize: ticket owner (evaluationId match) OR super-admin. authorType derived from who's calling (owner→`user`, super-admin→`admin`). `addMessage`; then: if `user` → `emailAdminUserReply`; if `admin` → `emailUserReply`. ok.
- [ ] `/docs/support/[id]` — owner or super-admin only (else notFound). `SupportThread` renders messages (user vs admin styling) + reply box (if open) → POST → refresh.
- [ ] Verify dev. Commit.

## Task 10: Admin support console

**Files:** Create `src/app/(authed)/admin/support/page.tsx`, `[id]/page.tsx`, `src/components/admin/AdminSupportThread.tsx`; `src/app/api/admin/support/[id]/route.ts` (POST close/reopen). Add nav item to `admin-nav.ts`.

- [ ] `admin-nav.ts`: add `{ href:"/admin/support", label:"Support", section:"superadmin", anyGrant:[] , alwaysOn:false }` gated to super-admin — simplest: render the page behind `isSuperAdmin()` and add the nav item with a `superAdminOnly` flag (or reuse an existing always-shown-to-super pattern). v1: gate page + API on `isSuperAdmin()`.
- [ ] `/admin/support` — super-admin; list tickets (open first, newest) linking to `[id]`.
- [ ] `/admin/support/[id]` — thread + reply box (posts `admin` via the same `/api/support/[id]/messages`) + Close/Reopen (`POST /api/admin/support/[id]` `{ status }`).
- [ ] Verify dev end-to-end: file as user → admin sees it → admin replies → (email) → user thread shows admin msg. Commit.

## Task 11: Ship-time doc suggestions

**Files:** Create `scripts/suggest-docs.ts`; modify `.github/workflows/changelog-sync.yml`.

- [ ] `scripts/suggest-docs.ts` — read recent meaningful commits (same `MEANINGFUL` regex + `git log --no-merges` as build-changelog), skip shas already in `doc_page_suggestions.source_commit`. For each doc page, prompt Haiku (AI Gateway) with the new commit subjects/bodies + the page's current `body_md`, asking: does anything PUBLIC about this page change? Return `{ changed: bool, proposed_md, rationale }`. Reuse build-changelog's SYSTEM hard rules verbatim (no PII, no point values, public-friendly). On `changed`, `upsertSuggestion`. No-op without `AI_GATEWAY_API_KEY`/DB URL.
- [ ] `changelog-sync.yml`: add a step after the changelog step: `pnpm exec tsx scripts/suggest-docs.ts 40` with the same env. (Same `ENABLE_CHANGELOG_SYNC` gate.)
- [ ] Dry-run locally against dev DB with a small limit to confirm it writes a suggestion (or cleanly no-ops). Commit.

## Task 12: Build, verify, PR

- [ ] `npx tsc --noEmit` (clean), `npx eslint <changed files>` (clean), `npx vitest run tests/app/docs.test.ts tests/app/support.test.ts tests/app/docs-nav.test.ts` (pass), `pnpm build` (clean, new routes present).
- [ ] PRD entry + commit; push branch; open PR with the **prod migration + seed** clearly flagged as a pre-deploy step for DROdio.
- [ ] Do NOT merge until DROdio runs `apply-docs-migration.ts` + `seed-docs.ts` on prod (new pages read the tables).

---

## Self-review
- **Spec coverage:** routes (T5,8,9,10) · doc_pages+seed (T1,3,4) · nav emoji (T2,5) · inline edit (T6) · suggestions+ship pipeline (T7,11) · support tickets+email+gates (T8,9,10) · public read / super-admin edit / claimed-file gates (T5,6,8) · seed content incl. endorsements/family/connecting (T4). Covered.
- **Consistency:** `updateDocPage(slug, bodyMd, clerkUserId)`, `upsertSuggestion({slug, proposedMd, rationale, sourceCommit})`, `addMessage(id, authorType, body)` used consistently across tasks.
- **Scope:** one cohesive subsystem; phased. OK.
