## Progress Update as of [June 30, 2026 — 6:58 PM Pacific]

### Summary of changes since last update
First entry. Built the auto-generating changelog: a Vercel cron runs every 12h,
pulls commits merged to the default branch in the last ~13h (overlap buffer),
dedupes by SHA against already-processed commits, and — only if there are NEW
commits — sends them to an LLM that returns aggregated, structured changelog
events. Author attribution is computed in code from the commit list (never by the
model). New entries are left unnotified so the existing changelog-notify cron
emails subscribers. Seeded/historical entries keep working (empty authors →
no byline).

### Detail of changes made
- **Schema** (`lib/db/schema/changelog.ts` + `ensureChangelogTables()` in
  `lib/changelog.ts`): added two idempotent columns —
  `authors jsonb NOT NULL DEFAULT '[]'` (array of `{name, login|null}`) and
  `commit_shas jsonb NOT NULL DEFAULT '[]'` (the SHAs an entry aggregates =
  dedupe key). Existing `commit_sha` kept as the representative (newest) sha.
  Drizzle columns use `$type<>()`. CREATE + ALTER … IF NOT EXISTS both updated.
- **`lib/github.ts` → `listRecentCommits(sinceISO)`**: GETs
  `/repos/{REPO}/commits?since=…&per_page=100`, paginates up to 2 pages (~200),
  stops on a short page, returns `{sha,title,body,authorName,authorLogin,date,url}[]`.
  Best-effort: `[]` on any error (missing token / non-2xx / network). Reuses the
  existing `REPO`, `token()`, `headers()`.
- **`lib/changelog-generate.ts` (NEW, DB-free)**: `generateChangelogEntries(commits, model=callModel)`.
  Reuses the Vercel AI Gateway + Anthropic-fallback + `hasModelKey()` + injectable
  `ModelCall` pattern from `lib/resources-label.ts`. Prompt tells the model to
  minimize/aggregate aggressively (many small → one "Minor fixes and tweaks";
  a big multi-commit effort → one entry with highlight bullets; fold chore/CI/
  test/deps; plain non-technical language; no names/emails/secrets). Tolerant
  JSON parse; invalid change types default to `enhancement`, non-existent
  category slugs filtered. **Authors computed in code** from each event's
  `commitShas` (dedupe by login, fallback name; null login allowed). Every input
  SHA assigned to exactly one event (resolve() only matches still-unassigned
  shas); leftovers folded into a final "Minor fixes and tweaks" bug_fix entry so
  nothing is lost. `shippedAt` = newest commit date; representative `commitSha` =
  newest sha; slug = `slugify(title)-<7charsha>` with a uniqueness suffix. NEVER
  throws — returns `[]` on model failure / no commits / no model key.
- **Cron `app/api/cron/changelog-generate/route.ts` (NEW)**: mirrors the notify
  route's CRON_SECRET Bearer guard, `runtime="nodejs"`, `dynamic="force-dynamic"`.
  `ensureChangelogTables()`; `since = now - 13h`; `listRecentCommits`; builds the
  covered-SHA set from existing entries' `commit_shas` + `commit_sha`; drops
  covered SHAs. **No new commits → returns `{generated:0}` WITHOUT calling the
  model.** Else generate → insert each (authors, commit_shas, representative
  commit_sha), `onConflictDoNothing` on slug + skip if any sha already covered,
  `notifiedAt` left NULL. Returns counts.
- **`vercel.json`**: added `{ "/api/cron/changelog-generate", "0 */12 * * *" }`.
- **UI wiring**: `ChangelogEntryView` + `getChangelogEntries` now carry `authors`;
  `app/changelog/timeline.tsx` renders `by <Name> (<login link>)` comma-separated
  under the title (amber link, muted text, `rel="noopener noreferrer"`,
  `target="_blank"`). No authors → nothing rendered. Deep-link/filter behavior
  untouched. `lib/changelog-email.ts` also adds a `by …` byline (optional/trivial).
- **Tests**: `lib/changelog-generate.test.ts` (aggregation of many commits into
  one entry; author derivation+dedupe incl. a null login; model can't invent
  authors; leftover folding; every sha assigned exactly once even on duplicate
  claims; newest date/sha; invalid type/category filtering + fenced JSON; model
  throw → []; empty → no model call). `lib/github.test.ts` (mock fetch: parse,
  since param, no-token short-circuit, non-2xx → [], throw → []).

### Validation
- `npx tsc --noEmit` clean.
- `npm run lint` clean (no new errors).
- `npm test` → 649 passed (59 files), including 14 new.
- Did NOT run `next build` — the worktree's node_modules is symlinked to the main
  checkout, so a build there is unreliable. Verify build in CI / a clean checkout.

### Env the new cron depends on
- `CRON_SECRET` (Bearer auth — already used by changelog-notify).
- `GITHUB_ADMIN_TOKEN` (commit fetch — already used by lib/github.ts).
- `VERCEL_AI_GATEWAY` / `AI_GATEWAY_API_KEY` (with `ANTHROPIC_API_KEY` fallback,
  optional `ENRICHMENT_MODEL`) — already used by lib/resources-label.ts.
- `DATABASE_URL` (Neon — already used app-wide).

### Potential concerns to address
- The generate cron (every 12h) and notify cron (every 6h) both run; a generated
  entry lands unnotified and the next notify run emails it — intended, but means
  up to ~6h between generation and email.
- `next build` unverified in-worktree (symlink caveat above).
- LLM aggregation quality depends on the model; the code-side leftover fold + the
  covered-SHA dedupe guarantee correctness (no lost/duplicated commits) even if
  the model behaves oddly.
