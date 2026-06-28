# Setup: Beads (bd) issue tracker

## Progress Update as of 2026-06-18 5:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adopted **beads** (`bd`) as the project issue tracker. Ran `bd init`
(prefix `ff`) + the Claude/Codex integrations. Per owner: **full beads** — `bd` owns
task tracking and persistent memory (`bd remember`) instead of TodoWrite/TaskCreate and
MEMORY.md — **except the per-branch `PRD/<branch>.md` commit posts, which STAY.**

### Detail of changes made:
- `bd` v1.0.5 was already installed (npm). `bd init --prefix ff` created the beads
  data dir at the **repo root** `/Users/drodio/Projects/founder-festival/.beads/`
  (embedded Dolt DB). It lives at the git common dir, so **all worktrees on this machine
  share one issue graph** — no per-worktree fragmentation.
- Tracked-file changes (this branch, committed): the BEADS INTEGRATION blocks added to
  `CLAUDE.md` and `AGENTS.md` (+ a BEADS CODEX SETUP block in AGENTS.md), a new
  `.claude/settings.json` (SessionStart hook → `bd prime --hook-json`), the beads agent
  skill at `.agents/skills/beads/SKILL.md`, and `.codex/` (Codex hooks/config).
- **Hand-edited the integration text** in both `CLAUDE.md` and `AGENTS.md`: added an
  explicit "EXCEPTION — keep the PRD commit posts" rule so no future agent drops the
  `PRD/<branch>.md` journaling. The husky pre-commit guard still enforces it.
- `git config core.hooksPath` was switched by beads from `.husky` → `.beads/hooks`.
  Beads **merged** the full husky `pre-commit` (PRD reminder, scoring-rubric-sync guard,
  drizzle schema-drift guard, point-disclosure guard) into `.beads/hooks/pre-commit` and
  appended its own hook after — nothing was lost. (hooksPath is local per-clone config.)
- Issue prefix: `ff` → issues named `ff-<hash>`.

### Next:
- Land this on `main` so every worktree/agent adopts beads (merge, then other worktrees
  pull/merge main).
- Commit the root `.beads/` config files (`config.yaml`, `metadata.json`, `README.md`,
  `.gitignore`) — they live in the **main worktree** (outside this worktree), so they
  must be committed from the repo root, not from here.
- OFFER: migrate the existing ~30 `MEMORY.md` entries into beads (`bd remember` for
  facts/prefs; `bd create` for backlog items like the profile social card, event
  followups phases, the deleted-chat change) so nothing is orphaned under "full beads".

### Potential concerns to address:
- **Memory split risk:** the harness still auto-loads `MEMORY.md` each session. Until the
  entries are migrated to `bd remember`, memory lives in two places. "Full beads" only
  fully holds once migration happens.
- **hooksPath is local config**, not committed — a fresh clone or a worktree that resets
  `core.hooksPath` to `.husky` would run the husky hooks (fine) but not the beads hook.
- The beads "Conservative (default)" git profile says "don't commit/push unless asked";
  this repo's established workflow (deploy-every-time + husky-enforced PRD posts) is the
  overriding instruction. Watch for agents becoming over-cautious about committing.
