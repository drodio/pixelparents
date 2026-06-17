# Pixel Parents — Progress Log (branch: `main`)
*(Most recent updates at top)*

## Progress Update as of June 17, 2026 — 2:59 PM Pacific

### Summary of changes since last update
Redacted personal contact info (a child's first name + grade and a personal phone number) from an earlier progress-log entry, since this repo is public. Scope was deliberately limited to `PRD/main.md` per DROdio.

### Detail of changes made:
- **`PRD/main.md`:** the email-signature entry no longer quotes the literal signature string; it now just describes it (name + family intro + contact phone) without the values.
- **Intentionally left as-is (DROdio's decision):** the same details remain in `lib/email.ts` (the `SIGNATURE` constant) and on the public `app/signup/thanks/page.tsx` intro — these are DROdio's own self-introductions and were kept on purpose.
- **Git history left as-is:** the phone number is still present in historical commits (introduced in `2146d28`); no history rewrite was done. Treat the number as already-public.

### Potential concerns to address:
- **Public repo + PII discipline:** future progress-log entries (and code) must avoid quoting personal phone numbers / minors' names verbatim — describe, don't transcribe. The `.githooks/pre-commit` secret guard does not catch PII like this.
- If the phone number ever needs to be truly removed from GitHub, it requires a history rewrite + force-push (currently blocked by `main` branch protection) and should be treated as already-exposed regardless.

## Progress Update as of June 17, 2026 — 2:34 PM Pacific

### Summary of changes since last update
Linked the words "open source" in `builders.md` to the GitHub repo (https://github.com/drodio/pixelparents). First change made under the new branch → PR workflow (see CLAUDE.md): committed on branch `worktree-builders-page` and opened as a PR rather than pushed straight to `main`. Also diagnosed why pixelparents.org/builders was 404ing in production (see concerns).

### Detail of changes made:
- **`builders.md`:** "it's open source" in the "How we work" bullet now links to `https://github.com/drodio/pixelparents`. Verified the rendered link in the build output.
- Build + lint clean; `/builders` still statically prerendered.

### Potential concerns to address:
- **Production 404 on /builders is a DEPLOY problem, not a code problem.** The page is correct on `origin/main` (commit `e0ed561`) and in the GitHub repo. But pixelparents.org is served by **manual `vercel --prod` CLI deploys** (the live production deployment has `gitSource: null` / no git metadata / CLI user `drodio-storytell`). The GitHub repo *is* connected to the Vercel project, but pushes appear to only produce Preview deployments — production is updated by hand. A manual prod deploy ~7m ago (by a parallel agent, from a local checkout that predates `/builders`) became the live alias, so the page 404s even though it's on main. "It was working before" was likely a Preview URL or an earlier prod deploy that a later manual deploy clobbered.
- **Recommended durable fix:** stop manual `vercel --prod` deploys (parallel agents keep clobbering each other from divergent local states) and let Vercel's Git integration auto-deploy `main` to Production on merge. Until then, production must be redeployed from latest `main` by hand to pick up `/builders`.

## Progress Update as of June 17, 2026 — 1:37 PM Pacific

### Summary of changes since last update
Added a public `/builders` page that renders the Pixel Parent Builder Guidelines from an open-source Markdown file (`builders.md` at the repo root). Built on an isolated worktree branch (`worktree-builders-page`) off latest `origin/main`, verified via `npm run build` + `npm run lint`, and pushed to `main`.

### Detail of changes made:
- **`builders.md` (repo root):** the canonical, editable source for the guidelines — "Pixel Parent Builder Guidelines v0.1" (proposed, to be ratified). Sections: Who we are, How we work (×2), What we protect. Editing this file + redeploying is all it takes to update the page.
- **`app/builders/page.tsx`:** server component, statically prerendered (`○ /builders` in build output). Reads `builders.md` at **build time** via `fs.readFileSync(join(process.cwd(), "builders.md"))` — no runtime fs dependency, so the root file doesn't need bundle tracing. Matches the `/developers` look: black bg, centered mascot header, `max-w-3xl`. Footer points readers to `builders.md` in the OSS repo and links to `/developers`.
- **`app/builders/markdown.tsx`:** `"use client"` renderer using `react-markdown` + `remark-gfm`, with a `components` map styling h1/h2/p/ul/li/strong/em/a to the dark theme (bullets render as bordered cards). All element styling is here so editing `builders.md` never requires CSS changes.
- **Deps added:** `react-markdown@^9` and `remark-gfm@^4` (first markdown libs in the repo).

### Potential concerns to address:
- **Build-time read means content updates require a redeploy.** If we later want live editing without a deploy, move the source to a DB/CMS or switch the page to `force-dynamic` (and ensure the file is bundle-traced). Build-time is the right call for v0.1.
- **Guidelines are v0.1 / "proposed."** Once the builders ratify them, bump the version in `builders.md` (page updates automatically on next deploy).
- **No nav link yet.** `/builders` is reachable by URL and from the `/developers` footer, but the homepage doesn't link to it — add to site nav when there is one.

## Progress Update as of June 16, 2026 — 12:50 PM Pacific

### Summary of changes since last update
All Pixel Parents email now sends from the verified `DROdio@pixelparents.org`
sender and carries DROdio's signature block. (`pixelparents.org` was already a
verified sending domain on Resend — no DNS work needed.) Sent a test email from
the new address to confirm.

### Detail of changes made:
- **Resend:** confirmed `pixelparents.org` domain is `verified` (sending enabled).
  Sent a test email from `DROdio@pixelparents.org` to drodio@storytell.ai +
  DROdio@pixelparents.org (Resend id 011804c4…).
- **`lib/email.ts`:** refactored to a single `sendEmail()` helper that all
  notifications route through. New default `FROM = "DROdio <DROdio@pixelparents.org>"`.
  Every email now appends DROdio's signature block (name, a short family intro,
  and a contact phone — literal value redacted from this public log; it lives in
  `lib/email.ts`).
- **Vercel env:** updated `RESEND_FROM` (Production) to
  `DROdio <DROdio@pixelparents.org>` (code default matches as a safety net).
- Verified `next build` + TypeScript clean.

### Potential concerns to address:
- `RESEND_FROM` updated for **Production** only (Preview/Dev unset → fall back to
  the code default, which is the same address). Fine for live email.
## Progress Update as of June 16, 2026 — 12:01 PM Pacific

### Summary of changes since last update
On a new API access request, the applicant now also gets a confirmation email
("under review"), alongside the existing admin notification. Guarded so a
duplicate submit doesn't re-email.

### Detail of changes made:
- **`lib/email.ts`:** added `notifyApiRequestReceived({to,name})` — "Your Pixel
  Parents API request is under review ⏳", links to /account.
- **`lib/db/api-keys.ts`:** `createRequest` now returns `{ row, created }`.
- **`app/(authed)/account/actions.ts`:** `submitRequest` emails the applicant +
  admin only when `created` is true (no re-emailing on duplicate submits).
- Verified `next build` + TypeScript clean.
## Progress Update as of June 16, 2026 — 8:39 AM Pacific

### Summary of changes since last update
Fixed the public entry into the approval flow. This app's Clerk `auth.protect()`
**rewrites signed-out visitors to 404** (same as `/admin`), so the `/developers`
"Request API access" CTA → `/account` would 404 for logged-out users. Routed the
CTA through `/sign-in?redirect_url=/account` and made the sign-in page honor a
relative `redirect_url` (also benefits the admin login).

### Detail of changes made:
- **`app/developers/page.tsx`:** both CTAs now link to `/sign-in?redirect_url=/account`.
- **`app/(authed)/sign-in/[[...sign-in]]/page.tsx`:** reads `redirect_url` (relative
  paths only — open-redirect guard) and passes `forceRedirectUrl` / `signUpForceRedirectUrl`
  to `<SignIn>`. Signed-out → sign-in/up → lands on `/account`.

### Verified earlier (prod, SQL-seeded keys): approved key → 200, pending → 401,
no key → 401, /breakdowns (approved) → 200, /developers → 200. `/account` 404s for
signed-out (expected — matches `/admin`); the CTA now sends them to sign-in first.
## Progress Update as of June 16, 2026 — 8:35 AM Pacific

### Summary of changes since last update
Replaced instant self-serve API keys with an **approval flow**: Clerk account
up front → request → admin approve/reject (+ email) → reveal key on a Clerk-gated
`/account` page. One gate now — every endpoint requires an approved key. Spec:
`docs/superpowers/specs/2026-06-16-api-key-approval-flow-design.md`.

### Detail of changes made:
- **Schema (`lib/db/schema/api-keys.ts`):** added `clerk_user_id`, `status`
  (pending|approved|rejected), `decided_at`, `decided_by`, `reject_reason`,
  `revealed_at`; `key_hash`/`key_prefix` now nullable; `tier` retired. Live Neon
  DB migrated via idempotent ALTERs (`lib/db/ensure.ts` self-migrates on cold
  start; also ran `scripts/migrate-apikeys.mjs` — 2 legacy keys backfilled `approved`).
- **DB ops (`lib/db/api-keys.ts`):** `getRequestByClerkUser`, `createRequest`
  (one active row/user), `getRequestById`, `approveRequest`, `rejectRequest`,
  `revealOrRotateKey` (generates key only after approval, raw shown once),
  `listRequests`. `verifyApiKey` now requires `status='approved'` + not revoked.
- **Auth (`lib/api/authorize.ts`):** collapsed to one check — approved key or 401.
  All four `/api/v1/*` routes updated; `/me` returns `{status:"approved"}`.
  Removed `tierSatisfies`/`Tier`. Deleted the old public `POST /api/developers/keys`.
- **`/account` (new, `app/(authed)/account/`):** Clerk-gated page renders by state
  (none→request form, pending, rejected→reason+reapply, approved→reveal/regenerate
  key). Server actions `submitRequest`/`revealKey`/`regenerateKey`. `proxy.ts` now
  protects `/account` too.
- **Admin (`app/(authed)/admin/api-requests/`):** filled the stub — lists requests
  (pending first) with Approve / Reject(reason) server actions; re-checks `isAdminEmail`.
- **Email (`lib/email.ts`):** `notifyAdminNewApiRequest` (on new request) +
  `notifyApiDecision` (approved/rejected to applicant, approval links to /account).
- **Public `/developers`:** removed the open key console; now a "Request API access"
  CTA → `/account`, a 3-step "how access works", and endpoints with no tier column.
- **Validation:** `keyRequestSchema` → `apiRequestSchema` (just `intended_use`).
- Verified: `next build` + TypeScript clean; `vitest` 11/11.

### Potential concerns to address:
- **No server-side OHS verification** — "OHS families only" is honor-system +
  manual admin review (by design for now).
- **Clerk sign-up must be enabled** in the Clerk instance for new applicants to
  create accounts; admin approval still required before any key.
- End-to-end (Clerk sign-in → request → approve → reveal → call API) is verified
  via a SQL-seeded approved key against prod; full UI path should be smoke-tested
  in the browser.
## Progress Update as of June 16, 2026 — 4:44 AM Pacific

### Summary of changes since last update
`/developers` layout tweak: the two red OHS notice lines were each direct
children of the `gap-6` header, so they had a big gap between them. Wrapped both
in a single `text-red-500` div (no gap) so they sit tight as one block. Shipped.

### Detail of changes made:
- **`app/developers/page.tsx`:** wrapped the two red `<p>` lines in a
  `<div className="text-red-500">` (color hoisted to the wrapper) to remove the
  inter-line gap while preserving the header's spacing to the H1 and body copy.
## Progress Update as of June 16, 2026 — 4:43 AM Pacific

### Summary of changes since last update
Key-console copy: added a caption under the Email field — "Must be an email
address registered to an OHS student or parent". Kept as a persistent caption
(not an input placeholder, which would truncate/vanish on typing). Shipped.

### Detail of changes made:
- **`app/developers/key-console.tsx`:** `<span className="text-xs text-white/40">`
  helper under the Email input; and a textarea `placeholder` on "What are you
  building?" — "Tell us what you think you want to build. It's also totally okay
  if you're not sure yet." Still honor-system — no server-side OHS check.
## Progress Update as of June 16, 2026 — 4:42 AM Pacific

### Summary of changes since last update
`/developers` Test-tier copy tweak only: "no approval." → "no approval required
(on your honor that you are an OHS family).". Shipped to prod. No behavior change.

### Detail of changes made:
- **`app/developers/page.tsx`:** Test (formerly Public) tier card description
  reworded. The OHS-only restriction remains honor-system in the copy — there is
  still no server-side OHS verification on key issuance.
## Progress Update as of June 16, 2026 — 4:41 AM Pacific

### Summary of changes since last update
`/developers` red-notice copy tweaks only: reworded line 1 to "This API is
limited to use by OHS families only" and added a non-bold red second line
"Encourage your child(ren) to code (or vibe code!) something fun with this API!".
Shipped to prod.

### Detail of changes made:
- **`app/developers/page.tsx`:** header now has two red `<p>` lines — bold line 1
  (reworded), and a `font-normal text-red-500` line 2. No behavior change.
## Progress Update as of June 16, 2026 — 4:36 AM Pacific

### Summary of changes since last update
`/developers` copy/label changes only (no behavior change): added a red
"This API is limited use by OHS families only" notice under the headline, and
relabeled the two tiers on the page — "Public" → "Test", "Approved" → "OHS
Families". Shipped to prod.

### Detail of changes made:
- **`app/developers/page.tsx`:** red notice `<p className="text-base font-semibold
  text-red-500">` below the H1; ENDPOINTS tuple type + values relabeled
  (`"Public"|"Approved"` → `"Test"|"OHS Families"`); both tier card titles
  relabeled; the endpoints-table tier-color conditional updated to
  `tier === "OHS Families"`.
- **Display-only:** the underlying API tier values are unchanged — keys are still
  stored/checked as `public` / `approved` in the DB and `lib/api-keys.ts`. Only
  the page wording changed. (If we want the API's own tier names + error copy to
  match "Test"/"OHS Families", that's a separate behavior change.)
- Verified `next build` + TypeScript clean.
## Progress Update as of June 15, 2026 — 10:25 PM Pacific

### Summary of changes since last update
Scrubbed "children" from the public Developer API surface per DROdio: removed
`total_children` from `/api/v1/stats`, renamed `children_by_grade` →
`signups_by_grade` in `/api/v1/breakdowns` (grade still counted from child rows,
just relabeled), and reworded the `/developers` privacy copy to "never any PII
like names, emails, phones, or photos." Shipped to prod.

### Detail of changes made:
- **`lib/db/aggregates.ts`:** `Stats` no longer has `total_children`; `getStats`
  dropped the children count. `Breakdowns.children_by_grade` → `signups_by_grade`
  (query still reads `children.grade`, aggregated counts only — comment added).
- **`app/developers/page.tsx`:** metadata + header privacy line → "never any PII
  like names, emails, phones, or photos"; tier copy drops "total children";
  endpoints table stats desc → "(signups, updated_at)"; EXAMPLE_STATS drops
  `total_children`; EXAMPLE_BREAKDOWNS `children_by_grade` → `signups_by_grade`.
- **`app/developers/key-console.tsx`:** footer privacy line reworded to match.
- Verified: `next build` + TypeScript clean; no leftover `total_children` /
  `children_by_grade` references in `app`/`lib`.

### Potential concerns to address:
- `signups_by_grade` is slightly a misnomer — counts are over child rows (a family
  can have multiple children in different grades), surfaced under a signups-named
  key per request. Still aggregate-only, no PII.
## Progress Update as of June 15, 2026 — 9:27 PM Pacific

### Summary of changes since last update
Built the `/admin` dashboard: a table of all signup submissions plus the ability to promote/revoke any submitter as an admin. Admin status is now DB-backed (new `admins` table keyed by email) and composes with the `ADMIN_EMAILS` env superadmin list — a person is granted admin the moment they sign in to Clerk with an email that's in either set, so public sign-ups stay open and no Clerk config change is needed.

### Detail of changes made:
- **New `admins` table** (`lib/db/schema/admins.ts`, barrel-exported in `lib/db/schema/index.ts`): `email` PK, `created_at`, `created_by`. Created idempotently in Neon (already live, 0 rows) and self-heals via `ensureAdminsTable()` per the existing `api_keys`/`ensure.ts` pattern.
- **`lib/admin.ts`:** `isAdminEmail(email)` = env allowlist ∪ `admins` table row; plus `isEnvAdmin`, `dbAdminEmails()` (a Set for rendering per-row state without N+1), `addAdmin`/`removeAdmin`.
- **`/admin` page** (`app/(authed)/admin/page.tsx`): gated by `isAdminEmail`; renders a horizontally-scrollable table of ALL submissions (submitted date, name, contact, GitHub link, affiliation, tech depth, time commitment, skillsets, location, parent interests, children w/ grade+interests, photo count) with a per-row **Make admin / Revoke** control. Env superadmins show a non-revocable "Superadmin" badge. Header shows counts (submissions / children / db-admins).
- **Server action** (`app/(authed)/admin/actions.ts`): `setAdmin(formData)` re-verifies the *caller* is an admin server-side (never trusts the client), refuses to touch env superadmins, upserts/deletes the email, `revalidatePath('/admin')`.
- **Data now:** 4 signups / 2 children in Neon. Build green with the full route set (admin + signup + dev-api).

### Potential concerns to address:
- **Bootstrap admin = `drodio@storytell.ai`** (the env superadmin). Sign in to Clerk with THAT email to reach `/admin` and promote others; any other sign-in email is locked out until added (env or DB).
- **Clerk live domain still provisioning** (`clerk.pixelparents.org`) — until Clerk's edge serves it, production sign-in renders a blank widget; local dev (`pk_test`) works now. A background watcher is polling and will report when it goes live.
- **Admin is keyed by email, not Clerk user id** — fine for this trust model; revisit if stricter identity binding is ever needed.
- **Photos shown as counts only** (private Blob); viewing kids' photos would need signed `getDownloadUrl()` URLs (deferred).

## Progress Update as of June 15, 2026 — 7:07 PM Pacific

### Summary of changes since last update
Implemented the full `/signup` + family-profile feature on the `signup` branch (separate git worktree at `../pixelparents-signup`), then merged `origin/main` (the Developer API) into it and reconciled all shared-file conflicts. Build + all 16 tests pass with both features composed. Provisioned Neon + a private Blob store under the personal account. Shipping to production next.

### Detail of changes made:
- **Feature built:** public `/signup` (req: first/last/email/phone/**GitHub username**; optional skills/availability) → `/signup/thanks?id=` (personalized DROdio intro, full-width `banner.webp`, optional family/child profile with interest pills, client-optimized **private** photo uploads to Vercel Blob, repeatable children) → `/signup/welcome`. Server actions + Zod + Vercel BotID. Email via Resend (no-ops until `RESEND_API_KEY` set).
- **Provisioning (personal account `drodio1s-projects`):** Neon `neon-rose-planet` (`DATABASE_URL` etc., live + verified via smoke test), private Blob store `pixelparents-photos` (`BLOB_READ_WRITE_TOKEN`). Project was moved from `storytell` → `drodio1s-projects` mid-build.
- **Merge reconciliation (shared files):** `lib/options.ts` is now one canonical source — long user-facing labels, with `AFFILIATIONS`/`TECH_DEPTH`/`OPTIONS` aliases the API uses. `lib/db/index.ts` uses the API agent's lazy `getDb()`; my code updated to call it. `lib/email.ts` holds both `notifyNewSignup` (SDK) and `notifyKeyRequest` (REST). `lib/validation.ts` holds both schemas. `lib/db/schema/index.ts` barrel exports `api-keys` + `signups`. `package.json` unions both dep sets. `next.config.ts` keeps www-redirect + adds `withBotId`.
- **DB:** `signups`/`children` synced to Neon. NOTE: did **not** push the regenerated migration's `api_keys` unique-constraint change — that table is the API agent's and holds a real key row; `drizzle-kit push` wanted an interactive truncate, which I declined. Their table is untouched.

### Potential concerns to address:
- **Two agents → one production.** Deploying my branch to prod must include the API agent's already-merged work; I'm merging to `main` (not a raw worktree deploy) so both ship together.
- **Pending on DROdio (away):** Clerk browser setup (admin gate) + `RESEND_API_KEY` (email). Until then, `/admin` isn't built and signup emails no-op — signups still save to Neon.
- **Kids' photos are private** (private Blob); admin viewing (deferred) will need `getDownloadUrl()` signed URLs.
- **`api_keys` unique constraint** may be missing on the live shared DB (the API agent's concern) — flagged, not modified.

## Progress Update as of June 15, 2026 — 6:48 PM Pacific

### Summary of changes since last update
Replaced the default create-next-app boilerplate in `README.md` with a short, parent-facing welcome message inviting Stanford OHS parents to contribute. Done on an isolated worktree branch (`worktree-readme-ohs-welcome`) to avoid an in-flight Clerk-auth merge that was occupying the main checkout, then pushed straight to `main`.

### Detail of changes made:
- **`README.md`:** now a "Hello Stanford OHS parent!" welcome — explains this is an OSS project for parents to build software supporting kids at OHS, directs interested parents to DM DROdio on the Tech Pixel Parents WhatsApp group, and gives a fallback email (DROdio+OHS@Gmail.com) for parents not yet in the group. Dropped the Next.js/Vercel getting-started scaffolding.
- **Workflow note:** committed from a git worktree because the main checkout had an uncommitted parallel-agent merge (Clerk auth + Developer API). This commit only touches `README.md` + this log, so it merges cleanly with that work.

### Potential concerns to address:
- README no longer documents local dev setup. If/when external contributors arrive, consider adding a CONTRIBUTING.md or a "Local development" section.

## Progress Update as of June 15, 2026 — 6:46 PM Pacific

### Summary of changes since last update
Added Clerk authentication with an admin-only gate, mirroring the founder-festival setup, and wired it through to production. Built on an isolated `worktree-clerk-auth` branch (under `.claude/worktrees/clerk-auth`) and merged into `main`. Verified locally; production env vars and Clerk DNS are now in place (propagating).

### Detail of changes made:
- **Dependency:** `@clerk/nextjs` v7 added (merged alongside the parallel signup/dev-api deps — Neon/Drizzle/Zod/Vitest).
- **Middleware:** `proxy.ts` (this Next.js version's renamed `middleware.ts`) runs `clerkMiddleware` and protects `/admin(.*)` via `createRouteMatcher` + `auth.protect()`. Public splash is untouched.
- **Provider scoping:** `<ClerkProvider>` lives in `app/(authed)/layout.tsx`, NOT the root layout — so the public coming-soon splash loads zero Clerk JS and triggers no dev handshake. Verified: `/` returns 200 with no `ClerkProvider`/`clerk.browser.js`/publishable key in the HTML.
- **Routes:** `app/(authed)/sign-in/[[...sign-in]]/page.tsx` (`<SignIn/>`) and `app/(authed)/admin/page.tsx` (gated). Verified locally: `/admin` signed-out → `307` to `/sign-in?redirect_url=…/admin`; `/sign-in` renders the real Clerk widget (dev instance `clerk.accounts.dev`).
- **Admin gating is two layers:** `proxy.ts` requires *signed-in*; the admin page additionally checks `ADMIN_EMAILS` (comma-separated allowlist) so signing up via Clerk is not enough to reach admin tools. Seeded `ADMIN_EMAILS=drodio@storytell.ai`.
- **Env (local):** `.env.example` documents `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `ADMIN_EMAILS`. Local `.env.local` uses Development-instance keys (`pk_test`/`sk_test`) so localhost works with no DNS; live keys (`pk_live`/`sk_live`, bound to `clerk.pixelparents.org`) are in git-ignored `.env.prod.local`.
- **Production wiring (DONE):** live keys added to Vercel **Production**; test keys to **Preview** + **Development**; `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and `ADMIN_EMAILS` set across all three (preview env vars added via the Vercel REST API because the CLI wouldn't target "all preview branches" non-interactively). 5 Clerk CNAMEs created on the `pixelparents.org` Cloudflare zone via flarectl, all **unproxied**: `clerk`→frontend-api, `accounts`→accounts, `clkmail`→mail, `clk._domainkey`/`clk2._domainkey`→dkim1/dkim2 (`*.clerk.services`).
- **Vercel project moved:** `pixelparents` was transferred from the `storytell` team to `drodio1s-projects`; the repo was re-linked (`.vercel/project.json` orgId now `team_qK4jnhrT8pwg9pnSiIzXLUIe`).

### Potential concerns to address:
- **DNS propagation / Clerk verification pending:** the 5 Clerk CNAMEs were just created; Clerk auto-verifies once they propagate (minutes–hours). The live `clerk.pixelparents.org` gate won't fully function until verification completes — watch the Clerk dashboard (Domains) for the green check.
- **Clerk allows public sign-ups by default:** anyone can create a Clerk account; the `ADMIN_EMAILS` allowlist is what actually restricts `/admin`. Consider setting the Clerk app to restricted/invite-only sign-ups if public account creation is undesirable.
- **Provisioning path:** keys came from the Clerk dashboard (Pro account) directly, not the Vercel Marketplace integration (the Marketplace flow was abandoned at terms-acceptance — no resource provisioned, but worth a `vercel integration list` check to confirm nothing dangling).

## Progress Update as of June 15, 2026 — 6:18 PM Pacific

### Summary of changes since last update
Brainstormed and wrote an approved design spec for a **Developer API** for pixelparents.org (modeled on festival.so/developers), plus a `/developers` docs page. No implementation code yet — spec only, committed so the parallel signup agent and future agents can see the plan and the coordination contract.

### Detail of changes made:
- **Spec:** `docs/superpowers/specs/2026-06-15-developer-api-design.md` — full design, user-approved.
- **Reconciled the "require approval" ask:** getting an API key is **self-serve/instant**; getting **elevated data** requires DROdio approval. Two tiers on a single key: `public` (instant) sees only ultra-abstract aggregates (total signups, total children, updated_at); `approved` (DROdio flips a per-key flag in `/admin`) adds richer **non-PII** reads (option taxonomies + count breakdowns). **Raw PII is never exposed at any tier** — honors the signup spec's privacy note.
- **v1 is read-only.** Write/ingest (`POST /api/v1/signups`) is explicitly deferred.
- **Endpoints:** `GET /api/v1/stats` (public), `GET /api/v1/me` (public), `GET /api/v1/options` (approved), `GET /api/v1/breakdowns` (approved). Plus `POST /api/developers/keys` to self-serve a `public` key (returns raw once, emails DROdio the request). Auth = `Authorization: Bearer sk_pixelparents_live_…`; 401 unknown/revoked, 403 `approval_required` on tier mismatch.
- **New `api_keys` table** in its own schema file (`lib/db/schema/api-keys.ts`) to avoid colliding with the signup agent. Stores SHA-256 hash + display prefix + name/email/intended_use + tier + approved/revoked/last_used timestamps. Raw key shown once.
- **`/developers` page** (`app/developers/page.tsx`): Pixel Parents look-and-feel (black bg, mascot), festival-style sections — header + privacy promise, tiers, endpoints table, example responses, and an **open** "get a key" console (no login needed since Tier 1 is self-serve).
- **`/admin`** gets a small "API keys" section (approve/revoke) reusing the signup feature's Basic Auth gate.

### Potential concerns to address:
- **Parallel-build coordination is the #1 risk.** A second agent is concurrently building `/signup` (Neon + Drizzle + Zod). This feature only *adds* files and *shares* the DB client (`lib/db`), `DATABASE_URL`, `lib/options.ts`, and `lib/email.ts`. Plan must reconcile shared files (prefer a `lib/db/schema/` directory + barrel + drizzle-kit glob so both agents' tables compose without editing the same file).
- **DB may not exist yet when the API ships.** Aggregate endpoints must guard on table existence (`to_regclass('public.signups')`) and degrade to zeroed counts + `database: "pending"` (200, not 500).
- **No rate limiting in v1** — public self-serve keys return only low-risk aggregate counts; noted as a future hardening item.
- **Next step:** writing-plans skill to produce the implementation plan; then build (TDD for key mechanics + tier gating + zod). Implementation lands in subsequent commits.

## Progress Update as of June 15, 2026 — 6:05 PM Pacific

### Summary of changes since last update
Brainstormed and wrote an approved design spec for a two-step parent onboarding feature (no implementation code yet). Committed the spec so other agents can see the plan before building.

### Detail of changes made:
- **Spec:** `docs/superpowers/specs/2026-06-15-signup-family-profile-design.md` — full design, user-approved.
- **Feature scope:** `/signup` (recruit OHS parents: required first/last/email/phone + optional skills/availability profile) → redirect to `/signup/thanks?id=<uuid>` (personalized DROdio intro + optional family/child seed-data profile with dynamic interest pills, multi-photo upload, repeatable children).
- **Decisions locked:** Neon Postgres via Vercel Marketplace; Drizzle ORM + drizzle-kit; Zod (shared); Vercel BotID for bot protection; Vercel Blob for photos with **client-side** resize/compress (~1600px, ~0.8) before upload; Resend email notifications to **DROdio@chief.bot** (user has a Resend account); DROdio-only `/admin` via HTTP Basic Auth middleware.
- **Data model:** family-level fields (city, state, parent_interests, photos) on `signups`; `children` as 1:N. Interests pill pool = distinct union of parent + child interests.
- **Explicitly deferred:** OHS-family authenticated public viewing (copy is a forward promise), family self-edit, verified custom email domain, the concrete reference URL to DROdio's own submission.

### Potential concerns to address:
- **Children's PII/photos are sensitive.** v1 stores in Neon behind admin-only access and builds NO public viewing — keep it that way until real OHS-family identity verification exists.
- **New env vars incoming:** `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_TO`, `ADMIN_USER`/`ADMIN_PASSWORD`. All go in git-ignored `.env.local` + Vercel env; templates in `.env.example`. Pre-commit secret guard covers them.
- **Next step:** writing-plans skill to produce the implementation plan; then build (likely TDD for zod/validation + pure logic). Implementation will land in subsequent commits.

## Progress Update as of June 15, 2026 — 9:02 AM Pacific

### Summary of changes since last update
Generated a favicon set from the pixel mascot and replaced the default Next.js favicon. Shipped to prod via the Git auto-deploy pipeline.

### Detail of changes made:
- **Source:** `public/images/pixel-mascot.png` (934×918, has alpha). Center-cropped to square (918×918) with Pillow 9.0.0 (no ImageMagick on this machine), LANCZOS resampling.
- **Generated app-router icons** (Next.js auto-detects these by filename):
  - `app/favicon.ico` — replaced the default Create-Next-App icon; lean multi-size ICO (16/32/48, ~10KB).
  - `app/icon.png` — 512×512, drives `<link rel="icon">` (served at `/icon.png`).
  - `app/apple-icon.png` — 180×180 apple-touch-icon (served at `/apple-icon.png`).
- **Build:** `next build` confirms `/icon.png` and `/apple-icon.png` routes are emitted; `favicon.ico` served statically from `app/`.
- **Deploy:** pushed to `main` → auto production deploy (Git integration).
- Note: regenerating favicons is a manual Pillow step (one-liner is recorded in this entry's git commit / can be re-derived from the mascot); not scripted into the build.

### Potential concerns to address:
- Favicon generation is a manual step — if the mascot art changes, the icons must be regenerated. Consider a small `scripts/gen-favicons.py` if this recurs.
- Icons are derived by center-crop; if the mascot art ever has meaningful detail near the horizontal edges it could be clipped (current art is centered with transparent margins, so this is safe today).

## Progress Update as of June 15, 2026 — 7:57 AM Pacific

### Summary of changes since last update
Enabled Git-based auto-deploy and set up the `www` subdomain. The GitHub repo was already connected to the Vercel project (push-to-`main` auto-deploys; PRs get preview URLs). Added a `www` DNS record and made `www.pixelparents.org` redirect to the apex via an in-code Next.js host redirect.

### Detail of changes made:
- **Git auto-deploy:** `vercel git connect` reported `drodio/pixelparents` is already connected to project `storytell/pixelparents`. Pushing to `main` now triggers production deploys automatically; non-`main` branches/PRs get preview deployments. (Manual `vercel deploy --prod` still works as a fallback.)
- **www DNS:** added `CNAME www -> cname.vercel-dns.com` (DNS-only / un-proxied) in Cloudflare via `flarectl`. Zone now has apex `A` + `www` `CNAME`.
- **www attached to project:** `vercel domains add www.pixelparents.org` — domain added under team `storytell`.
- **www -> apex redirect:** added a host-based 308 redirect in `next.config.ts` (`has: host == www.pixelparents.org` -> `https://pixelparents.org/:path*`). Chosen over a dashboard-only redirect so it's version-controlled and reproducible. Build verified locally.
- Project facts: Vercel project id `prj_aKSLUrQ9LYwTcXwCFV0a9xyMyH50`, Node 24.x, framework preset Next.js.

### Potential concerns to address:
- **www redirect depends on a deploy:** the 308 lives in the app, so it only takes effect once the commit deploys. Verify `https://www.pixelparents.org` 308s to the apex after the auto-deploy lands (and after DNS/cert propagation for www).
- **CI secret scan** still recommended as a backstop (see earlier entries) — the local pre-commit hook is bypassable.

## Progress Update as of June 15, 2026 — 7:53 AM Pacific

### Summary of changes since last update
Hardened the new pre-commit secret guard in response to roborev findings on the previous commit (job 5, verdict F). The generic credential scan was case-sensitive and would have missed the most common secret casing (uppercase env-style vars like `AWS_SECRET_ACCESS_KEY=` / `CLOUDFLARE_API_TOKEN=`); fixed that plus two lower-severity issues. Re-tested and confirmed the guard now blocks uppercase secrets while still ignoring placeholders.

### Detail of changes made:
- **Case-insensitive generic scan (Medium fix):** `grep -EI` → `grep -EiI` so uppercase `KEY=value` secrets are caught (the original missed them; high-signal provider fingerprints already matched specific token shapes regardless of case).
- **Fixed-string log reminder (Low fix):** `grep -qx "$prd"` → `grep -qxF "$prd"` so branch names with regex metacharacters (e.g. `feature/foo.bar`) compare literally.
- **Narrowed scan exclusion (Low fix):** the added-line scan now excludes only `.githooks/pre-commit` (the file that legitimately contains the patterns) instead of the whole `.githooks/` dir, so future hook scripts are still scanned for secrets.
- **Verification:** planted uppercase `AWS_SECRET_ACCESS_KEY`/`CLOUDFLARE_API_TOKEN` values (now blocked); confirmed placeholder values (`your_token_here`, anything containing `EXAMPLE`) still pass; real repo files still pass.
- roborev finding job 5 closed after these fixes landed.

### Potential concerns to address:
- The generic credential heuristic is still best-effort: it requires a `keyword=value` shape with 16+ value chars and skips a placeholder allowlist, so novel secret formats or secrets not preceded by a known keyword can slip. The CI secret-scan backstop (gitleaks/trufflehog) remains the recommended belt-and-suspenders for a public repo.

## Progress Update as of June 15, 2026 — 7:46 AM Pacific

### Summary of changes since last update
First entry for this branch. Bootstrapped the project from an empty repo into a deployed, live one-page Next.js site: scaffolded a Next.js (App Router + TypeScript + Tailwind) app, built a "Hello, world" landing page featuring the pixel mascot centered on a black background, pushed to GitHub (preserving the pre-existing LICENSE), deployed to Vercel production, and wired the custom domain `pixelparents.org` through Cloudflare DNS. Also added open-source safety tooling (a secret-scanning pre-commit hook) and this progress-logging workflow.

### Detail of changes made:
- **Stack:** Next.js (App Router, no `src/` dir), TypeScript, Tailwind CSS, ESLint. Scaffolded via `create-next-app`. Node 23 local; project runs on Vercel.
- **Homepage:** `app/page.tsx` renders the mascot (`public/images/pixel-mascot.png`, 934×918) via `next/image` (`priority`), centered on a `bg-black` page, with "Hello, world" + "Pixel Parents — coming soon." Metadata (title/description) set in `app/layout.tsx`.
- **Git/GitHub:** Repo `github.com/drodio/pixelparents` (public). Local history was merged with the remote's existing `LICENSE` via `--allow-unrelated-histories`. Default branch `main`.
- **Vercel:** Project `pixelparents` under team `storytell`. Deployed to production. Aliases: `https://pixelparents.vercel.app` and the production deployment URL. Deploys done via `vercel deploy --prod` CLI (not yet wired to auto-deploy-on-push Git integration — see concerns).
- **Domain / DNS:** `pixelparents.org` added to the Vercel project. DNS is managed in **Cloudflare** (zone nameservers `erin/patrick.ns.cloudflare.com`). Added apex `A @ -> 76.76.21.21` (DNS-only / un-proxied) via `flarectl`. Vercel issued the SSL cert (90d). Verified the edge serves HTTP/2 200 with valid cert via `curl --resolve`. The `.org` registry delegation finished cutting over from Namecheap to Cloudflare during setup.
- **Tooling installed:** `flarectl` (Cloudflare CLI) at `~/go/bin/flarectl`. Cloudflare token lives in git-ignored `.env.local` (template in `.env.example`); env var name `CLOUDFLARE_API_TOKEN`.
- **Open-source safety:** Added `.githooks/pre-commit` (committed, reviewable) that blocks secrets/sensitive files (`.env`, private keys, provider token fingerprints, generic `key=value` secrets) and reminds to update this progress log. Enabled via `git config core.hooksPath .githooks` (each clone must run this once). Verified by planting fake AWS/private-key/token strings (blocked) and confirming real files pass. `.env.example` is force-tracked via a `!.env.example` exception in `.gitignore`.
- **roborev coexistence:** roborev (local AI review loop) installs its `post-commit` via a machine-wide `core.hooksPath`; our local override would shadow it, so `.githooks/post-commit` and `.githooks/post-rewrite` re-delegate to roborev when present (no-op for clones without it). roborev verdicts on all commits so far are PASS; machine-wide FAIL backlog is clear.
- **Docs/automation:** `CLAUDE.md` updated with the per-commit progress-log workflow so future agents do it automatically.

### Potential concerns to address:
- **Local DNS cache:** the developer's macOS still cached the old Namecheap parking IP (`192.64.119.197`) at handoff; flush with `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder`. Not a server-side issue — the site is live globally.
- **No Git-based auto-deploy:** deploys are manual via CLI. Consider connecting the GitHub repo to the Vercel project so pushes to `main` deploy automatically and PRs get preview URLs.
- **`www` not configured:** only the apex is set up. No `www.pixelparents.org` record or redirect yet.
- **Hook is local-only enforcement:** `core.hooksPath` must be set per clone and is bypassable with `--no-verify`. For a public repo, add a CI secret-scan (e.g. gitleaks/trufflehog GitHub Action) as a backstop. The current secret scan is heuristic and can have false positives/negatives.
- **Cloudflare proxy off:** apex record is DNS-only (correct for Vercel SSL). If proxying is ever enabled, configure Cloudflare SSL mode to "Full (strict)" to avoid redirect loops.
- **Vercel auth for MCP:** the `plugin:vercel:vercel` MCP server still needs `/mcp` authentication (separate from the CLI, which is authed as `drodio-storytell`).
