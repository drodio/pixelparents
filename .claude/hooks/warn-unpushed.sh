#!/usr/bin/env bash
# Stop hook: warn (non-blocking) when there are unpushed commits, so the
# "always branch → commit → push → PR" policy isn't silently broken by leaving
# work local. Backstop only — the real discipline lives in CLAUDE.md.
set -euo pipefail

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ -z "$branch" ] && exit 0

# Count commits that haven't reached the remote. Prefer the branch's upstream;
# fall back to origin/main for a branch that hasn't been pushed yet.
if upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
  ahead=$(git rev-list --count "${upstream}..HEAD" 2>/dev/null || echo 0)
else
  ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
fi

if [ "${ahead:-0}" -gt 0 ]; then
  if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
    msg="⚠️ ${ahead} unpushed commit(s) on ${branch}. Project policy: move them to a feature branch and open a PR (never leave work on ${branch})."
  else
    msg="⚠️ ${ahead} unpushed commit(s) on '${branch}'. Project policy: push and open a PR before finishing."
  fi
  # JSON-escape via the here-string into a minimal python one-liner (jq may be absent).
  python3 -c 'import json,sys; print(json.dumps({"systemMessage": sys.argv[1]}))' "$msg"
fi
exit 0
