@AGENTS.md

# This repo is PUBLIC / open source

Never commit secrets, credentials, private keys, or `.env*` files (only
`.env.example`-style templates). A `.githooks/pre-commit` secret guard backstops
this, but treat the discipline as the real protection, not the hook.

**Never commit PII or sensitive personal data.** That includes real personal
emails (gmail, company addresses, etc.), phone numbers, **children's names**,
home addresses, customer/applicant data pulled from the DB, and live secret
tokens/share URLs/keys. This applies everywhere — source, `PRD/*.md` progress
logs, `docs/`, READMEs, comments, commit messages. Keep real values in env vars
(`.env.local`, Vercel env) and use placeholders (`<admin-email>`, `<token>`) or
the project's own `pixelparents.org` address in committed text. When logging work
in `PRD/`, write "the applicant" / "the child" — never the actual name or contact.
The `.githooks/pre-commit` guard also blocks personal emails and phone numbers,
but it can't catch names — that's on you.

Enable the hooks once per clone: `git config core.hooksPath .githooks`

# Git workflow: ALWAYS branch → commit → push → PR (do this without being asked)

Never commit directly to `main`, and never leave commits sitting unpushed. Every
piece of work follows this flow, end to end, without waiting to be asked:

1. Before starting work, create a feature branch off `main`
   (e.g. `feat/…`, `fix/…`, `chore/…`). Keep `main` clean — it should always
   match `origin/main`.
2. Commit in small increments (each commit still updates `PRD/<branch>.md` and
   triggers the roborev review loop — drain `verdict=F` findings before pushing).
3. `git push -u origin <branch>` and open a PR with `gh` (target `main`). Always
   give the user the PR URL.
4. The user merges when ready (do NOT auto-merge unless they ask). After merge,
   sync local `main` (`git switch main && git pull`).

A `Stop` hook in `.claude/settings.json` backstops this by warning when commits
are unpushed — treat that warning as "open the PR now," not as optional.

# Progress log: update on EVERY commit (do this without being asked)

This project keeps a per-branch progress log under `PRD/<branch>.md`
(e.g. `PRD/main.md`). It is the canonical hand-off context for the next agent.

On every commit you make, BEFORE committing:

1. Determine the current branch and open `PRD/<branch>.md`. If it does not
   exist, create it and seed it with the first entry using the format below.
2. Read the latest (top) entry, work out what has changed since then, and
   PREPEND a new entry at the top (newest first — never append to the bottom).
3. Make the entry comprehensive enough that another agent could fully catch up
   on the branch from it alone.
4. Stage the updated `PRD/<branch>.md` as part of the same commit.
5. After committing, explicitly tell the user that you updated the progress log.

Entry format (newest entries go ABOVE older ones):

```
## Progress Update as of [Month D, YYYY — H:MM AM/PM Pacific]

### Summary of changes since last update
[one paragraph max: what changed since the previous entry]

### Detail of changes made:
- [bullets: context a future LLM needs to ramp up on status of the branch]

### Potential concerns to address:
- [bullets: anything that is or could become an issue as we keep building]
```

Use real Pacific time: `TZ=America/Los_Angeles date "+%B %-d, %Y — %-I:%M %p Pacific"`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
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
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
