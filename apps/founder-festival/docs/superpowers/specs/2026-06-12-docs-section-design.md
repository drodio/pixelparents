# Founder Festival docs section (`/docs`) — design

**Date:** 2026-06-12 · **Branch:** `docs-section` · **Status:** approved-by-default (DROdio, build-while-away)

## Goal
A best-in-class-ish (Mintlify-style, quick-and-dirty) public documentation site at
`https://festival.so/docs`: a left nav with emoji icons, markdown-based pages,
super-admin inline editing from the page, a Support page that files email-backed
tickets (claimed users only), and an auto-suggestion pipeline that proposes doc
updates on every ship.

## Decisions (resolved with DROdio before he stepped away)
- **Auto-update = draft suggestions you publish.** Ship pipeline LLM-drafts doc
  edits into a suggestions table; super-admin reviews + one-click publishes.
  Never auto-clobbers manual prose.
- **Support = in-app thread + email pings.** No inbound-MX dependency. Admin
  replies in-app; user emailed a link to view/reply in-app.
- **Docs are public** (logged-out readable). Edit = super-admin only. Filing a
  ticket = claimed users only.

## Architecture & routes
Public top-level route group `src/app/docs/` (sibling of `connect/`, outside
`(authed)` — Clerk middleware still attaches identity for the gates).

- `src/app/docs/layout.tsx` — shared shell: logo header (mirror `/changelog`),
  the docs left nav, and the page body slot. Public.
- `src/app/docs/page.tsx` — renders the `quickstart` page (index).
- `src/app/docs/[slug]/page.tsx` — renders the `doc_pages` row for `slug`
  (`profiles`, `leaderboard`, `account`, `events`). `notFound()` for unknown
  slugs that aren't in `DOCS_NAV`.
- `src/app/docs/support/page.tsx` — the Support page (file a ticket + list mine).
- `src/app/docs/support/[id]/page.tsx` — one ticket thread (owner or super-admin).
- `src/app/(authed)/admin/support/page.tsx` + `[id]/page.tsx` — admin console:
  list tickets, open one, reply.

`export const dynamic = "force-dynamic"` on docs pages (DB-backed, viewer-aware
edit affordance).

## Data model (3 new tables)
```
doc_pages                       -- the live, editable docs content (markdown)
  id uuid pk
  slug text unique              -- 'quickstart' | 'profiles' | 'leaderboard' | 'account' | 'events'
  title text
  emoji text
  nav_order int
  body_md text                  -- markdown source of truth (live)
  updated_at timestamptz
  updated_by text               -- clerk user id of the last editor (or 'seed')

doc_page_suggestions            -- ship-pipeline proposed edits, pending review
  id uuid pk
  slug text                     -- target page (FK-by-value to doc_pages.slug)
  proposed_md text              -- full proposed new body
  rationale text                -- one line: why (from the shipped commits)
  source_commit text            -- the sha that triggered it (idempotency-ish)
  status text                   -- 'pending' | 'published' | 'discarded'
  created_at timestamptz
  resolved_at timestamptz
  index (slug, status)
  unique (slug, source_commit)  -- one suggestion per page per commit

support_tickets
  id uuid pk
  evaluation_id uuid            -- the claimed filer (gate: must be non-null)
  clerk_user_id text
  email text                    -- filer email at creation (for notifications)
  subject text                  -- derived from first line, else 'Support request'
  status text                   -- 'open' | 'closed'
  created_at, updated_at timestamptz
  index (evaluation_id), index (status, updated_at)

support_ticket_messages
  id uuid pk
  ticket_id uuid                -- FK support_tickets.id
  author_type text              -- 'user' | 'admin'
  body text
  created_at timestamptz
  index (ticket_id, created_at)
```
All additive → idempotent `CREATE TABLE IF NOT EXISTS` script
(`scripts/apply-docs-migration.ts`), drizzle migration generated for history.
Dev applied by the builder; **prod applied by DROdio (or with consent) before
deploy** — the new pages read these tables.

## Seeding
- `content/docs/{quickstart,profiles,leaderboard,account,events}.md` — canonical
  initial markdown, committed in the repo.
- `scripts/seed-docs.ts` — idempotent: for each file, upsert the `doc_pages` row
  on `slug` ONLY IF the row is absent or still `updated_by = 'seed'` (never
  clobber a human edit). Sets title/emoji/nav_order from `DOCS_NAV`.
- Lib `src/lib/docs.ts` owns all reads/writes: `getDocPage(slug)`,
  `listDocPages()`, `updateDocPage(slug, md, clerkUserId)`,
  `pendingSuggestionCount(slug)`, `listSuggestions(slug)`,
  `publishSuggestion(id)`, `discardSuggestion(id)`, `upsertSuggestion(...)`.

## Left nav (reuse the admin-nav pattern)
- `src/lib/docs-nav.ts` — `DOCS_NAV: { slug, label, emoji, href }[]` + a
  `docsActiveHref(pathname)` mirroring `admin-nav.ts`'s `activeNavHref`.
  Order: 🚀 Quickstart, 👤 Profiles, 🏆 Leaderboard, ⚙️ Account, 📅 Events,
  (divider), 💬 Support.
- `src/components/docs/DocsNav.tsx` — client component mirroring `AdminNav.tsx`:
  desktop fixed left sidebar; mobile collapses to a top bar + slide-in drawer.
  Emoji rendered as plain text spans (no react-icons). Active item = white,
  others = gold (`#dfa43a`), matching the admin nav's visual language.

## Markdown rendering + super-admin inline edit
- Add `marked` (small, server-side md→HTML). Content is trusted (super-admin-
  authored + super-admin-published suggestions), so render via
  `dangerouslySetInnerHTML` inside a `.prose`-style wrapper. A `renderMarkdown(md)`
  helper in `src/lib/docs.ts` centralizes config (GFM, heading anchors).
- `src/components/docs/DocPageView.tsx` (client) — receives `slug`, `title`,
  `bodyMd`, pre-rendered `html`, `canEdit`, `pendingCount`. Default: shows the
  rendered HTML. Super-admin sees a floating action tray (mirroring
  `AdminProfileActions` — fixed, bottom-right, gold) with **Edit** and, when
  `pendingCount > 0`, **Review N suggestions**.
- Edit mode: swaps the rendered body for a full-height markdown `<textarea>`
  seeded with `bodyMd`, plus Save/Cancel. Save → `PATCH /api/docs/[slug]`
  ({ bodyMd }) → server re-checks `isSuperAdmin()` → `updateDocPage` → `router.refresh()`.
- Suggestion review: a panel listing pending suggestions for the page, each with
  its rationale + the proposed markdown (rendered) and Publish / Discard buttons
  hitting `POST /api/docs/[slug]/suggestions/[id]` ({ action }).

## Support tickets
- **Gate:** filing requires a claimed profile — `getViewerEvaluationId()` non-null.
  Logged-out or unclaimed: the form is replaced with a prompt + link to `/claim`.
- **File:** `/docs/support` renders a single free-paragraph `<textarea>` ("How can
  we help?") + a submit button, and below it the viewer's existing tickets
  (status + last update, linking to `/docs/support/[id]`). Submit →
  `POST /api/support` ({ body }): server re-derives the evaluationId + email
  server-side (never trust client), creates the ticket + first `user` message,
  derives `subject` from the first line (truncated) or "Support request", then
  emails **drodio@festival.so** via `sendRawEmail` with a link to
  `/admin/support/[id]`. Returns the new ticket id; client routes to it.
- **User thread** `/docs/support/[id]`: visible to the ticket owner or a
  super-admin. Shows the message list (user right / admin left styling) and, if
  open, a reply box → `POST /api/support/[id]/messages` ({ body, authorType:'user' })
  → appends a `user` message, bumps `updated_at`, emails drodio a "new reply" ping.
- **Admin console** `/admin/support` (super-admin / a new `manage_support` grant —
  default to super-admin only for v1 to avoid RBAC churn): list open+closed
  tickets newest-first; `/admin/support/[id]` shows the thread + a reply box +
  Close/Reopen. Admin reply → `POST /api/support/[id]/messages`
  ({ body, authorType:'admin' }) → appends an `admin` message → emails the FILER a
  link to `/docs/support/[id]`. Close sets `status='closed'`.
- Emails use `sendRawEmail` with absolute links built from the request origin
  (prod = `https://festival.so`).

## Auto-doc suggestions on ship
- `scripts/suggest-docs.ts` — invoked from the existing `changelog-sync.yml` job
  (push → main), AFTER the changelog step, reusing `AI_GATEWAY_API_KEY` +
  `CHANGELOG_PROD_DB_URL`. It:
  1. Reads the same new meaningful commits the changelog uses (`feat|fix|ux|perf|
     refactor|security` since the last processed sha — dedupe via
     `doc_page_suggestions.source_commit`).
  2. For each docs page, asks Haiku (same model) whether the shipped commits
     change anything a *public* user should know about that page; if so, returns
     a full proposed `body_md` + one-line rationale. **Hard rules copied from
     build-changelog's SYSTEM prompt: never expose PII, never expose specific
     scoring point values / thresholds, public-friendly only.**
  3. Upserts `doc_page_suggestions` (status `pending`) — unique on
     `(slug, source_commit)`; a page with no relevant change yields nothing.
- The job no-ops without the secrets (same guard as changelog). It NEVER writes
  `doc_pages` directly — publishing is always a human super-admin click.
- Gated behind the same `vars.ENABLE_CHANGELOG_SYNC` flag (the docs step is part
  of the post-ship curation job).

## Seed content (public-safe; written by the builder)
- **Quickstart 🚀** — what Founder Festival is; that profiles are AI-scored; how
  to claim yours; reading the leaderboard; how scoring → event invitations work.
  Cross-links to the other pages.
- **Profiles 👤** — your founder/investor scores at a glance, badges/pills, the
  radar + matrix visuals, claiming/verifying. **Endorsements subsection:** what an
  endorsement is, that you spend points to endorse someone, why it matters
  (signal/credibility), and how to do it. (Describe mechanics qualitatively — no
  exact point values, per the public-safe rule.)
- **Leaderboard 🏆** — how ranking works, founder vs investor scores, the
  check/asterisk meaning, filtering/searching, what a rank reflects.
- **Account ⚙️** — claiming + editing your profile; adding **family / partner /
  pets** and **why** (so you're invited to events relevant to them — e.g. a
  family day, a partner-friendly dinner); managing email/contact; privacy basics.
- **Events 📅** — the attendee experience, RSVP/access, the event **Chat**, and
  **connecting** with attendees: what initiating a connection does, what it means
  when someone connects with you, and how connections surface follow-ups.

## Auth gates (summary)
- Read `/docs/*`: public.
- `PATCH /api/docs/[slug]`, suggestion publish/discard: `isSuperAdmin()`.
- `POST /api/support` (file): claimed user (`getViewerEvaluationId()` non-null).
- `/docs/support/[id]` view + user reply: ticket owner or super-admin.
- `/admin/support/*` + admin reply/close: super-admin (v1).

## Testing
- `src/lib/docs` unit: seed-idempotency (no clobber of human edit), suggestion
  publish copies proposed_md → body_md + flips status, discard flips status.
- `docs-nav` active-href resolution (mirror the admin-nav test).
- support: file requires evaluationId (403 when unclaimed); admin reply appends
  `admin` message + leaves ticket retrievable; close/reopen toggles status.
- `renderMarkdown` smoke (headings/lists/links render; raw script stripped or
  inert — verify marked output for a `<script>`-bearing input).

## Out of scope (v1)
- Inbound email reply threading (needs reply.festival.so MX + Resend Inbound).
- Per-page version history / rollback (DB holds only the live body).
- Search across docs, page-level TOC, dark/light toggle.
- Non-super-admin doc editors / a `manage_support` RBAC grant (super-admin only).
- Writing published docs back to the git repo (DB is the live source of truth).

## Deploy
PR → squash-merge → Vercel. The new pages READ the 3 tables, so the **prod
migration + seed must run before deploy** (DROdio runs the idempotent
`apply-docs-migration.ts` + `seed-docs.ts` against prod, or grants consent).
