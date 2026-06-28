# guard-no-manual-prod-deploy

## Progress Update as of 2026-06-19 07:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a hard rule to AGENTS.md: production is reached ONLY by merging to `main`
(GitHub→Vercel auto-deploy). Prohibits manual `vercel --prod`/promote/redeploy
and any direct writes to the prod DB from a worktree.

### Detail of changes made:
- `AGENTS.md` — new top section "Production is reached ONLY through `main`".
  Triggered by an incident: the Chief Deep Intelligence dossier branch reached
  festival.so (prod) before merging to main via (1) a manual `vercel --prod`
  deploy from a worktree — the Vercel CLI ships the working dir regardless of git
  branch — and (2) `_prod-dossier-setup.mjs` applying migration 0062 + seeding
  data straight to the prod Neon DB. (That feature has since merged properly via
  PR #406, but the process gap remained.)

### Potential concerns to address:
- This is a documentation/policy guard (effective because the breach came from an
  agent session that reads AGENTS.md). A stronger technical control would be
  restricting Vercel team roles so only the GitHub integration can deploy
  production — recommended as a follow-up the user can do in Vercel settings.
- An out-of-band prod migration (0062) was applied directly; verify prod schema
  matches the committed drizzle migrations.
