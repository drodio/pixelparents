# Pixel Parents — Progress Log (branch: `main`)
*(Most recent updates at top)*

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
