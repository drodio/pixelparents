# Pixel Parents — Progress Log (branch: `worktree-developer-api`)
*(Most recent updates at top)*

## Progress Update as of June 15, 2026 — 6:37 PM Pacific

### Summary of changes since last update
First entry for this branch. Implemented the read-only v1 of the **Developer API**
(per `docs/superpowers/specs/2026-06-15-developer-api-design.md`) in an isolated
git worktree, fully self-contained and DB-defensive so it doesn't collide with
the in-flight `/signup` work. Tests, typecheck, and production build all pass;
runtime smoke tests confirm the auth/tier gating and page render.

### Detail of changes made:
- **Branch/isolation:** built on `worktree-developer-api` (worktree at
  `.claude/worktrees/developer-api`), branched off `origin/main`. Cherry-picked the
  design spec onto the branch. **No files shared with the signup agent were edited**
  destructively — only additive new files + additive `.env.example`/`package.json` entries.
- **Deps added:** `drizzle-orm`, `@neondatabase/serverless`, `zod` (runtime);
  `vitest`, `drizzle-kit`, `dotenv` (dev). Scripts: `test`, `test:watch`,
  `db:generate`, `db:push`. `vitest.config.ts` (node env, `@/` alias).
- **Key model:** `lib/api-keys.ts` — pure logic: `generateApiKey` (prefix
  `sk_pixelparents_live_`), `hashApiKey` (sha-256), `parseBearer`, `tierSatisfies`.
  10 unit tests. `lib/validation.ts` — zod `keyRequestSchema`, 6 unit tests. **16 tests pass.**
- **DB layer (lazy, never touches `DATABASE_URL` at import):** `lib/db/index.ts`
  (`getSql`/`getDb`/`hasDatabase`), `lib/db/schema/api-keys.ts` (`api_keys` table)
  + barrel `lib/db/schema/index.ts`, `lib/db/api-keys.ts` (issue/verify/list/approve/revoke),
  `lib/db/aggregates.ts` (`getStats`, `getBreakdowns`, `getInterestsPool` — all guarded by
  `to_regclass`, degrade to zeros + `database:"pending"`, per-breakdown try/catch for column drift).
  `drizzle.config.ts` (schema dir glob → `lib/db/migrations`).
- **Routes:** `POST /api/developers/keys` (self-serve public key, returns raw once,
  best-effort Resend email via REST — no SDK dep), `GET /api/v1/stats` (public),
  `GET /api/v1/me` (public), `GET /api/v1/options` (approved), `GET /api/v1/breakdowns`
  (approved). Shared gate `lib/api/authorize.ts`: 401 / 403 `approval_required` / 503.
  All routes `runtime="nodejs"`, `dynamic="force-dynamic"`.
- **Page:** `app/developers/page.tsx` (black bg, mascot, tiers, endpoints table, example
  payloads) + `app/developers/key-console.tsx` (client form → key, shown once, copy button).
- **`lib/options.ts`:** option taxonomies (affiliations/tech-depth/skillsets/time-commitment/grades)
  — intended shared home with the signup feature.
- **Verification:** `vitest run` 16/16 pass; `next build` compiles + TS clean, all 7 routes
  emitted; smoke tests (no live DB): no-auth→401, key+no-DB→503, bad body→400 w/ field errors,
  `/developers`→200.

### Potential concerns to address:
- **MERGE/RECONCILE with the signup agent is the #1 open item.** Both features need
  the Neon/Drizzle DB layer. This branch created its own `lib/db/index.ts`, schema barrel,
  `lib/options.ts`, `drizzle.config.ts`, and added deps. At merge: unify on the
  `lib/db/schema/` directory + barrel pattern (one file per domain), de-dupe `lib/options.ts`,
  reconcile `package.json`/lockfile, and ensure one drizzle client. The signup agent
  also pivoted admin auth to **Clerk** (`@clerk/nextjs`, `app/(authed)/`, `proxy.ts`) —
  the spec assumed Basic Auth.
- **Admin approve/revoke UI not built here.** `approveApiKey`/`revokeApiKey`/`listApiKeys`
  data ops exist; wiring them into `/admin` was deferred because admin auth is in flux
  (Clerk vs Basic Auth). For now a key can be approved via SQL/`db:studio`. Add the admin
  section at merge time, gated by whatever auth lands.
- **Happy-path (valid key → reads) is unverified locally** — needs a live `DATABASE_URL`
  (Neon) + the `api_keys` table created (`drizzle-kit push`/migration). Run the migration
  and an end-to-end check on a Neon branch / preview deploy before relying on it.
- **No rate limiting** on the public self-serve key (low-risk: aggregate counts only). Noted as future hardening.
- **Migrations not generated** (no `DATABASE_URL` at build time). Run `npm run db:generate`
  (or `db:push`) against Neon to create `api_keys` before first real use.
