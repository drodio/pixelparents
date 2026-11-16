## Progress Update as of November 15, 2026 — 6:37 PM Pacific

### Summary of changes since last update
Add an admin-managed blog with unlisted reading links, Markdown photo/video embeds, draft/published status, previews, and link revocation/rotation. Readers need no account.

### Detail of changes made:
- Admin → Blog uses the existing black/amber UI, Clerk session checks and isAdminEmail authorization in both the page and action.
- Separate public `/blog/[token]` route accepts only a random UUID capability for a published post, returns no internal IDs, and exposes no public listing.
- `blog_posts` is in the Drizzle schema barrel; idempotent first-use DDL follows the changelog/admin self-healing pattern.
- Reuse react-markdown/remark-gfm without raw HTML. HTTPS images, YouTube/Vimeo embeds, and direct MP4/WebM/OGG video links render inline. Unsupported links remain links.
- No-store/no-referrer/no-index headers and metadata protect reading links; suppress blog/editor analytics even after client navigation.
- The editor retains the created post ID across saves and failures to avoid duplicate creation. Existing posts can be unpublished or have their token replaced.
- Documentation: `docs/blog.md`. Full suite: 98 files / 1127 tests passed. Full ESLint, TypeScript, production build, and diff checks passed. Fourteen focused regression tests exercise validation, rendering, auth, revocation query predicates and token rotation.

### Potential concerns to address:
- Links are bearer capabilities and can be forwarded. Media is embedded by URL and must be accessible to readers; no upload workflow is added.
- Live database/Clerk end-to-end testing needs deployment credentials; no production data or configuration was changed.
- Beads and roborev executables are unavailable; hooks are enabled and changes were reviewed manually.
- Connected GitHub account lacks upstream push permission. PR creation needs a fork; browser currently requires user sign-in.
