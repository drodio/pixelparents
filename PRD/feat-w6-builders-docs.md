## Progress Update as of [June 30, 2026 — 1:56 PM Pacific]

### Summary of changes since last update
First entry on this branch. Expanded `/builders` into a welcoming on-ramp for tentative students AND parents, and added a new light `/docs` curated index page. No changes to any out-of-scope areas (dashboard-shell, community, changelog, admin, resources, account, app/page.tsx, oauth internals, developers).

### Detail of changes made:
- `app/builders/page.tsx`: Added, above the existing `builders.md` guidelines render, a warm hero ("Anyone can be a builder"), a "New to building? Start here" section with a 4-step zero-to-first-change/PR path, a "Why this matters now" section framing the AI shift, and a "Two ways in" section (parents start & mentor / students start building). Kept the existing `Markdown content={source}` guidelines render, the `#student-builders` section, and the `#getting-started` setup instructions (Claude Code + desktop app) untouched. Footer now links to both `/developers` and the new `/docs`. On-theme dark/amber. New section JSX intentionally lives in the page, not `builders.md`, so the ratified guidelines doc stays a clean policy artifact.
- `app/docs/page.tsx` (NEW): light curated developer-docs index. Summarizes "Sign in with Pixel Parents" and links to `docs/sign-in-with-pixelparents.md` on GitHub; lists the public `/api/v1/*` endpoints (mirrors `app/api/v1/route.ts`) + links to the OpenAPI spec and MCP; explains how to request access (links `/developers`); points builders at the repo + CLAUDE.md/AGENTS.md for contributing. Dark/amber, matches `PixelMascot` + link conventions.

### Potential concerns to address:
- `/docs` links to the sign-in markdown via the public GitHub blob URL rather than an on-site rendered route — intentional to keep this LIGHT (no markdown pipeline). Could later render it on-site if desired.
- Playwright screenshot/auto-doc system was explicitly NOT built per scope — noted as a follow-up.
- The builders page now has one page-level `<h1>` plus the `builders.md` `<h1>` ("Pixel Parent Builder Guidelines") rendered by markdown.tsx as a section title under a divider; visually separated and labeled "The fine print", but two h1s exist in the DOM. Acceptable but could be revisited if strict single-h1 is desired.
