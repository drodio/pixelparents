# Pixel Parents — Progress Log (branch: `main`)
*(Most recent updates at top)*

## Progress Update as of June 15, 2026 — 6:48 PM Pacific

### Summary of changes since last update
Replaced the default create-next-app boilerplate in `README.md` with a short, parent-facing welcome message inviting Stanford OHS parents to contribute. Done on an isolated worktree branch (`worktree-readme-ohs-welcome`) to avoid an in-flight Clerk-auth merge that was occupying the main checkout, then pushed straight to `main`.

### Detail of changes made:
- **`README.md`:** now a "Hello Stanford OHS parent!" welcome — explains this is an OSS project for parents to build software supporting kids at OHS, directs interested parents to DM DROdio on the Tech Pixel Parents WhatsApp group, and gives a fallback email (DROdio+OHS@Gmail.com) for parents not yet in the group. Dropped the Next.js/Vercel getting-started scaffolding.
- **Workflow note:** committed from a git worktree because the main checkout had an uncommitted parallel-agent merge (Clerk auth + Developer API). This commit only touches `README.md` + this log, so it merges cleanly with that work.

### Potential concerns to address:
- README no longer documents local dev setup. If/when external contributors arrive, consider adding a CONTRIBUTING.md or a "Local development" section.
- The parallel Clerk-auth merge in the main checkout will need to reconcile with this `README.md` change when it lands — content is identical to what was staged there, so it should auto-resolve.

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
