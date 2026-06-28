# founder-festival — vercel production-deploy guard
# ---------------------------------------------------
# Defines a `vercel` shell-function wrapper that HARD-BLOCKS any production
# deploy / prod-alias move from the CLI, then transparently delegates every
# other invocation to the real `vercel` binary.
#
# WHY a shell wrapper and not a git hook: `vercel --prod` does not go through
# git, so a pre-push hook never sees it. The only place to intercept it is the
# `vercel` command itself. This wrapper is the belt-and-suspenders local guard
# that complements the real lock (Vercel RBAC / token hygiene) — see AGENTS.md
# ("Production is reached ONLY through `main`").
#
# Install (idempotent): copy this file to a stable, worktree-independent path
# and source it from your shell rc. The repo's scripts/guards/README.md has the
# one-liner. Works in both bash and zsh (portable POSIX function).
#
# Human escape hatch (intentionally undocumented to agents): to deploy by hand
# you must bypass the function explicitly, e.g. `command vercel ...` or the
# absolute binary path. Agents that type `vercel --prod` get a hard stop.

# Production domains/aliases that must never be moved from the CLI.
: "${FF_PROD_DOMAINS:=festival.so www.festival.so}"

vercel() {
  # `local` is supported by bash and zsh (the only shells that source this) and
  # scopes the helpers cleanly — no leakage into the interactive shell and no
  # manual `unset`, even if the function is interrupted mid-loop.
  local _ff_blocked="" _ff_prev="" _ff_a _ff_host _ff_rest _ff_d

  for _ff_a in "$@"; do
    case "$_ff_a" in
      --prod|--production)
        _ff_blocked="$_ff_a" ;;
      --target=production|--target=prod)
        _ff_blocked="$_ff_a" ;;
      production|prod)
        [ "$_ff_prev" = "--target" ] && _ff_blocked="--target $_ff_a" ;;
    esac

    # Any reference to a production domain (e.g. `vercel alias set ... festival.so`,
    # `vercel redeploy https://...festival.so`) is a prod-targeting action. Match
    # the prod domains as whole HOSTS (exact or subdomain), not bare substrings,
    # so safe args like `staging.festival.so.internal` or `my-festival.so-test`
    # don't false-positive. Extract the host from a URL/alias-looking arg first.
    _ff_host="${_ff_a#*://}"   # strip scheme://
    _ff_host="${_ff_host%%/*}" # strip /path?query
    _ff_host="${_ff_host##*@}" # strip user@ (userinfo)
    _ff_host="${_ff_host%%:*}" # strip :port
    _ff_host="$(printf '%s' "$_ff_host" | tr 'A-Z' 'a-z')" # DNS is case-insensitive
    # Iterate the domain list with a POSIX token-peel so it splits identically in
    # bash AND zsh (zsh does not word-split an unquoted scalar like a plain `for`
    # would rely on).
    _ff_rest="$FF_PROD_DOMAINS"
    while [ -n "$_ff_rest" ]; do
      _ff_d="${_ff_rest%% *}"
      case "$_ff_rest" in
        *" "*) _ff_rest="${_ff_rest#* }" ;;
        *) _ff_rest="" ;;
      esac
      [ -n "$_ff_d" ] || continue
      case "$_ff_host" in
        "$_ff_d"|*".$_ff_d") _ff_blocked="${_ff_blocked:-$_ff_a (production domain)}" ;;
      esac
    done

    _ff_prev="$_ff_a"
  done

  # Subcommands that only make sense against production (always the first arg).
  case "$1" in
    promote|rollback) _ff_blocked="${_ff_blocked:-$1}" ;;
  esac

  if [ -n "$_ff_blocked" ]; then
    printf '\n  \033[1;31m⛔ BLOCKED: manual production deploy is prohibited.\033[0m\n' >&2
    printf '     Matched: \033[1m%s\033[0m\n' "$_ff_blocked" >&2
    printf '     Production is reached ONLY by merging to `main` (GitHub→Vercel auto-deploys).\n' >&2
    printf '     See AGENTS.md → "Production is reached ONLY through `main`".\n\n' >&2
    return 1
  fi

  command vercel "$@"
}
