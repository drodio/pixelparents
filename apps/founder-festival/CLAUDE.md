@AGENTS.md

# Progress journaling (per-branch)

This repo keeps a running log of work in `PRD/<branch-name>.md`. On every commit you make, you MUST update that file before committing.

## Workflow

1. Determine current branch: `git branch --show-current`.
2. Look for `PRD/<branch>.md`. If it doesn't exist, create it with the first entry.
3. Prepend a new entry to the top of the file (newest entries first) using the format below.
4. Stage the PRD file together with the rest of your commit.
5. In your reply to the user, mention that you updated `PRD/<branch>.md` when you commit.

## Entry format

```md
## Progress Update as of <YYYY-MM-DD HH:MM AM/PM Pacific>
*(Most recent updates at top)*

### Summary of changes since last update
<One short paragraph max — what changed since the previous entry.>

### Detail of changes made:
- <Bulleted context a future LLM would need to ramp up on this branch.>

### Potential concerns to address:
- <Anything in the codebase that is or could become a problem as we keep building.>
```

A pre-commit hook in `.husky/pre-commit` reminds you to do this. Enable hooks with `git config core.hooksPath .husky`. Do not bypass with `--no-verify`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files
- **EXCEPTION — keep the PRD commit posts:** the per-branch `PRD/<branch>.md` journaling
  (see "Progress journaling" above) STAYS. Update `PRD/<branch>.md` on every commit and
  stage it with the commit, exactly as before. It is a commit work-log, not a TODO list,
  and `.husky/pre-commit` still enforces it — beads does not replace it.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
