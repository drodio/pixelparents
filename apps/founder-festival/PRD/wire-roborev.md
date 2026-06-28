# Wire roborev into founder-festival

## Progress Update as of 2026-06-19 11:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev's own first review of this branch (job 47 on commit 21c1e1a, 2 Low
findings on `.husky/post-commit`): replaced the fragile `|| && return 0` guard with an
explicit `if`, and corrected the comment (the roborev call is foreground — it enqueues
via the daemon and returns — matching roborev's own installed hook; not "non-blocking").

### Detail of changes made:
- `.husky/post-commit`: `_roborev_hook` fallback now uses `if [ -z … ] || [ ! -x … ]; then
  return 0; fi`; comment reworded. Behavior unchanged (still foreground enqueue).
- Closed roborev job 47 after the fix (fix-then-close per the roborev workflow).

## Progress Update as of 2026-06-19 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wired roborev (the auto-review daemon) into this repo. roborev fires via a GLOBAL
git hook (`~/.config/roborev/git-hooks`), but founder-festival sets a LOCAL
`core.hooksPath` (now `.beads/hooks`, was `.husky`), which overrode it — so roborev
never auto-reviewed this repo. Fixed by `roborev init` (registers the repo + installs
hooks into the active `.beads/hooks/`) and mirroring the roborev call into the tracked
`.husky/post-commit` for durability.

### Detail of changes made:
- `roborev init` (run from this worktree): registered founder-festival with the roborev
  daemon and installed `post-commit` + `post-rewrite` hooks into the active
  `.beads/hooks/`. roborev **prepended** its hook and preserved the existing changelog
  post-commit logic (both run).
- `.husky/post-commit` (this commit): prepended the same best-effort `_roborev_hook`
  block. `.husky/` is the canonical/tracked hook source; if beads ever re-merges husky
  hooks into `.beads/hooks/` (e.g. a `bd` re-init/upgrade), roborev survives. Only one
  hooksPath is active at a time, so there's no double-review in normal operation.
- Why local hooksPath existed: husky guards (PRD reminder, scoring-rubric sync, drizzle
  schema-drift, point-disclosure). Beads merged those into `.beads/hooks/` during the
  beads adoption (PR #402). roborev now coexists with all of them.

### Potential concerns to address:
- `core.hooksPath` is LOCAL per-clone config (not committed). A fresh clone, or a
  worktree that resets hooksPath, must re-run `roborev init` (and the beads hook setup)
  to get auto-review. Documented here.
- roborev needs a configured review agent (Claude Code/Codex); the daemon was already
  running and reviewing other repos, so this repo now joins that loop.
- This very commit should be the first roborev review for founder-festival — verify with
  `roborev show HEAD` after committing.
