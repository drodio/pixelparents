@AGENTS.md

# This repo is PUBLIC / open source

Never commit secrets, credentials, private keys, or `.env*` files (only
`.env.example`-style templates). A `.githooks/pre-commit` secret guard backstops
this, but treat the discipline as the real protection, not the hook.

Enable the hooks once per clone: `git config core.hooksPath .githooks`

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
