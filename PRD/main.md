# Pixel Parents — Progress Log (branch: `main`)
*(Most recent updates at top)*

## Progress Update as of June 15, 2026 — 7:46 AM Pacific
*(Most recent updates at top)*

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
