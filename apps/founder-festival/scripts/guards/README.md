# Local guards

Belt-and-suspenders local guardrails that complement — but do **not** replace —
the real production lock (Vercel RBAC + token hygiene; see `AGENTS.md` →
"Production is reached ONLY through `main`").

## `vercel-prod-guard.sh` — block manual production deploys

A `vercel` shell-function wrapper that hard-blocks prod-targeting CLI
invocations and transparently passes everything else to the real `vercel`
binary. A git hook can't do this — `vercel --prod` never goes through git, so
the only interception point is the `vercel` command itself.

### What it blocks (exit 1, real binary never runs)

- `vercel --prod` / `vercel deploy --prod` / `vercel --production`
- `vercel deploy --target production` / `--target=production`
- `vercel promote`, `vercel rollback`
- any command referencing a production domain (`$FF_PROD_DOMAINS`, default
  `festival.so www.festival.so`) — e.g. `vercel alias set … festival.so`,
  `vercel redeploy https://…festival.so`

Everything else (`vercel deploy` preview, `env pull`, `ls`, `whoami`,
`deploy --target preview`, …) passes through untouched.

### Install (per machine)

```sh
mkdir -p ~/.config/founder-festival
cp scripts/guards/vercel-prod-guard.sh ~/.config/founder-festival/
# add to ~/.zshrc (and/or ~/.bashrc):
echo '[ -f "$HOME/.config/founder-festival/vercel-prod-guard.sh" ] && source "$HOME/.config/founder-festival/vercel-prod-guard.sh"' >> ~/.zshrc
```

Open a new shell (or `source ~/.zshrc`). Works in bash and zsh. Active in every
shell — independent of which worktree you're in.

When this file changes, re-copy it to `~/.config/founder-festival/` to pick up
the update (the rc only sources the installed copy).

### Human escape hatch

The guard is a guardrail against accidental/agent prod deploys, not a security
boundary. If a human genuinely must deploy by hand, bypass the function
explicitly: `command vercel …` or the absolute binary path. Agents typing
`vercel --prod` get a hard stop. The real lock is Vercel-side RBAC/token policy.
