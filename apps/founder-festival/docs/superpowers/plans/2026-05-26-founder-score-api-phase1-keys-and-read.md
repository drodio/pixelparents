# Founder Score API — Phase 1: API keys + free read API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, authenticated, free read API — a developer with an API key can `GET /api/v1/score?linkedin_url=…` and receive the full curated Founder Score payload (or 404), rate-limited per key.

**Architecture:** A new `api_keys` table (store only a SHA-256 hash of each key). A small pure crypto lib + a DB verification helper. A pure payload **builder** (testable with fixtures) separated from a DB **fetcher** that gathers an evaluation's score rows / recommendations / percentiles / claim state. One Next.js route handler wires auth → validation → per-key rate limit → fetch. Billing and the dashboard are later phases; a seed script creates keys until the dashboard exists.

**Tech Stack:** Next.js 16 App Router (route handlers), Drizzle ORM + Neon serverless, Vitest, `node:crypto`. Reuses `canonicalizeLinkedinUrl`/`isValidLinkedinUrl` (`src/lib/canonicalize.ts`), `computePercentile` (`src/lib/leaderboard.ts`, already supports `"combined"`), and `checkAndIncrementRateLimit` (`src/lib/rate-limit.ts`).

**Spec:** `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`

**Scope note / spec correction:** The spec calls the combined percentile "NEW" — it is **not**; `computePercentile(score, "combined")` already exists and is already used on the profile page. No work needed there.

**Repo conventions for every commit:**
- Update `PRD/founder-score-api.md` (prepend a progress entry) and stage it, or the pre-commit hook fails.
- When `src/db/schema.ts` changes, run `pnpm db:generate` and stage the new `drizzle/*.sql` + `drizzle/meta/*` or the drift guard fails. Do NOT use `--no-verify`.
- Migrations are applied **manually** to each Neon DB (no auto-migrate on deploy). Phase 1 only needs the dev DB; prod application is a release step, not a code step.

---

### Task 1: Add the `api_keys` table + migration

**Files:**
- Modify: `src/db/schema.ts` (append a new table; reuse existing `pgTable`/`text`/`uuid`/`timestamp`/`index`/`uniqueIndex` imports already in the file)
- Create (generated): `drizzle/XXXX_*.sql` + `drizzle/meta/*` via `pnpm db:generate`

- [ ] **Step 1: Add the table definition** at the end of `src/db/schema.ts`:

```ts
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Owner of the key — a Clerk user id (the developer).
    clerkUserId: text("clerk_user_id").notNull(),
    // SHA-256 hash of the raw key. The raw key is shown to the user exactly
    // once at creation and never stored.
    keyHash: text("key_hash").notNull(),
    // First ~12 chars of the raw key (e.g. "sk_live_ab12") for dashboard display.
    keyPrefix: text("key_prefix").notNull(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    keyHashUnique: uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    ownerIdx: index("api_keys_clerk_user_id_idx").on(t.clerkUserId),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/XXXX_*.sql` containing `CREATE TABLE "api_keys"` with the unique index on `key_hash`. No other table is dropped/altered (if it tries to, STOP — schema drift).

- [ ] **Step 3: Apply to the dev DB**

Create a small one-off applier, `scripts/apply-sql.ts`, that runs a generated migration file against the local `DATABASE_URL`:

```ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) { console.error("usage: tsx scripts/apply-sql.ts <path-to-sql>"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL!);
const text = readFileSync(file, "utf8");
for (const stmt of text.split("--> statement-breakpoint")) {
  const s = stmt.trim();
  if (s) await sql.query(s);
}
console.log("applied", file);
```

Run: `DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/apply-sql.ts drizzle/XXXX_*.sql`
Expected: `applied …`. (Note the file name from Step 2.)

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/ scripts/apply-sql.ts PRD/founder-score-api.md
git commit -m "feat(api): add api_keys table"
```

---

### Task 2: Pure API-key crypto lib

**Files:**
- Create: `src/lib/api-keys.ts`
- Test: `tests/lib/api-keys.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/lib/api-keys.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";

describe("api-keys crypto", () => {
  it("generateApiKey returns a raw sk_live_ key, its sha256 hash, and a display prefix", () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.startsWith("sk_live_")).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hash).toBe(hashApiKey(raw)); // hash is deterministic for the raw key
  });

  it("generateApiKey is unique per call", () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });

  it("parseBearer extracts the token, case-insensitively", () => {
    expect(parseBearer("Bearer sk_live_abc")).toBe("sk_live_abc");
    expect(parseBearer("bearer sk_live_abc")).toBe("sk_live_abc");
  });

  it("parseBearer returns null for missing/malformed headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("sk_live_abc")).toBeNull();
    expect(parseBearer("Basic xyz")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run tests/lib/api-keys.test.ts`
Expected: FAIL — cannot import from `@/lib/api-keys` (module doesn't exist yet).

- [ ] **Step 3: Implement the pure crypto** (`src/lib/api-keys.ts`):

```ts
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "sk_live_";

// Generate a new API key. Returns the raw key (shown to the user exactly once),
// its SHA-256 hash (what we store), and a short display prefix.
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url"); // 32 url-safe chars
  const raw = `${KEY_PREFIX}${secret}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Pull the bearer token out of an Authorization header. Returns null when
// absent or malformed (the caller then returns 401).
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1]! : null;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm exec vitest run tests/lib/api-keys.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-keys.ts tests/lib/api-keys.test.ts PRD/founder-score-api.md
git commit -m "feat(api): api-key crypto (generate/hash/parseBearer)"
```

---

### Task 3: Key verification against the DB

**Files:**
- Modify: `src/lib/api-keys.ts` (append the DB-backed verifier)

This is DB-touching, so it's covered by the manual smoke test in Task 7 (the repo unit-tests pure logic only; route/DB paths are smoke-tested with curl).

- [ ] **Step 1: Append the verifier** to `src/lib/api-keys.ts`:

```ts
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export type VerifiedKey = { keyId: string; clerkUserId: string };

// Verify an Authorization header against api_keys. Returns the owner on success,
// or null (→ 401) when the key is missing, malformed, unknown, or revoked.
// Updates last_used_at on success (best-effort; not awaited-critical).
export async function verifyApiKey(authHeader: string | null): Promise<VerifiedKey | null> {
  const raw = parseBearer(authHeader);
  if (!raw) return null;
  const hash = hashApiKey(raw);
  const [row] = await db
    .select({ id: apiKeys.id, clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(apiKeys).set({ lastUsedAt: sql`NOW()` }).where(eq(apiKeys.id, row.id));
  return { keyId: row.id, clerkUserId: row.clerkUserId };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-keys.ts PRD/founder-score-api.md
git commit -m "feat(api): verifyApiKey DB lookup"
```

---

### Task 4: Seed script to create a key (for testing before the dashboard exists)

**Files:**
- Create: `scripts/create-api-key.ts`

- [ ] **Step 1: Write the script:**

```ts
import "dotenv/config";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { generateApiKey } from "@/lib/api-keys";

async function main() {
  const owner = process.argv[2] ?? "dev-test-user";
  const label = process.argv[3] ?? "dev test key";
  const { raw, hash, prefix } = generateApiKey();
  await db.insert(apiKeys).values({ clerkUserId: owner, keyHash: hash, keyPrefix: prefix, label });
  console.log("RAW KEY (shown once):", raw);
  console.log("owner:", owner, "prefix:", prefix);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it against the dev DB and save the key**

Run: `DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/create-api-key.ts dev-test-user "phase1 test"`
Expected: prints `RAW KEY (shown once): sk_live_…`. Save that key for Task 7's smoke test.

- [ ] **Step 3: Commit**

```bash
git add scripts/create-api-key.ts PRD/founder-score-api.md
git commit -m "chore(api): seed script to create an API key"
```

---

### Task 5: Pure score-payload builder

**Files:**
- Create: `src/lib/api/score-payload.ts` (builder + types only in this task)
- Test: `tests/lib/score-payload.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/lib/score-payload.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { buildScorePayload, type ScorePayloadInput } from "@/lib/api/score-payload";

const base: ScorePayloadInput = {
  linkedinUrl: "https://linkedin.com/in/jane-q-public",
  fullName: "Jane Q Public",
  companyName: "Acme",
  claimed: true,
  signalQuality: "high",
  overall: { score: 530, percentile: 78 },
  founder: { score: 410, percentile: 81 },
  investor: { score: 120, percentile: 60 },
  founderRows: [{ reason: "Current founder", points: 10, confidence: 100, status: "confirmed" }],
  investorRows: [],
  summary: { text: "Raise a seed round.", status: "confirmed", confidence: 90 },
  priorities: [{ id: "p1", text: "Hire a CTO", category: "hiring", rating: 4 }],
  scoredAt: new Date("2026-05-20T12:00:00Z"),
  cached: true,
  chargedCents: 0,
};

describe("buildScorePayload", () => {
  it("maps fields and splits first/last name (multi-word last name kept whole)", () => {
    const p = buildScorePayload(base);
    expect(p.first_name).toBe("Jane");
    expect(p.last_name).toBe("Q Public");
    expect(p.company_name).toBe("Acme");
    expect(p.scores.overall).toEqual({ score: 530, percentile: 78 });
    expect(p.founder_rows[0]).toEqual({ reason: "Current founder", points: 10, confidence: 100, status: "confirmed" });
    expect(p.what_you_likely_need).toEqual({ text: "Raise a seed round.", status: "confirmed", confidence: 90 });
    expect(p.current_priorities[0].rating).toBe(4);
    expect(p.scored_at).toBe("2026-05-20T12:00:00.000Z");
  });

  it("handles a null fullName", () => {
    const p = buildScorePayload({ ...base, fullName: null });
    expect(p.first_name).toBeNull();
    expect(p.last_name).toBeNull();
    expect(p.full_name).toBeNull();
  });

  it("sets cost basis from chargedCents", () => {
    expect(buildScorePayload(base).cost).toEqual({ charged_cents: 0, basis: "cached" });
    expect(buildScorePayload({ ...base, cached: false, chargedCents: 280 }).cost)
      .toEqual({ charged_cents: 280, basis: "10x_measured" });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm exec vitest run tests/lib/score-payload.test.ts`
Expected: FAIL — module `@/lib/api/score-payload` doesn't exist.

- [ ] **Step 3: Implement the builder** (`src/lib/api/score-payload.ts`):

```ts
export type ScoreRow = { reason: string; points: number; confidence: number; status: string };
export type PriorityRow = { id: string; text: string; category: string; rating: number | null };
export type SummaryBlock = { text: string; status: string; confidence: number };

export type ScorePayloadInput = {
  linkedinUrl: string;
  fullName: string | null;
  companyName: string | null;
  claimed: boolean;
  signalQuality: string;
  overall: { score: number; percentile: number };
  founder: { score: number; percentile: number };
  investor: { score: number; percentile: number };
  founderRows: ScoreRow[];
  investorRows: ScoreRow[];
  summary: SummaryBlock | null;
  priorities: PriorityRow[];
  scoredAt: Date;
  cached: boolean;
  chargedCents: number;
};

// Pure transform: gathered data → the public API response shape. Keeping this
// pure (no DB) makes the response contract unit-testable.
export function buildScorePayload(i: ScorePayloadInput) {
  const parts = (i.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return {
    linkedin_url: i.linkedinUrl,
    full_name: i.fullName,
    first_name: firstName,
    last_name: lastName,
    company_name: i.companyName,
    claimed: i.claimed,
    signal_quality: i.signalQuality,
    scores: {
      overall: i.overall,
      founder: i.founder,
      investor: i.investor,
    },
    founder_rows: i.founderRows,
    investor_rows: i.investorRows,
    what_you_likely_need: i.summary,
    current_priorities: i.priorities,
    scored_at: i.scoredAt.toISOString(),
    cached: i.cached,
    cost: {
      charged_cents: i.chargedCents,
      basis: i.chargedCents > 0 ? "10x_measured" : "cached",
    },
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm exec vitest run tests/lib/score-payload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/score-payload.ts tests/lib/score-payload.test.ts PRD/founder-score-api.md
git commit -m "feat(api): pure score payload builder"
```

---

### Task 6: DB fetcher (gathers data, calls the builder)

**Files:**
- Modify: `src/lib/api/score-payload.ts` (append `fetchScorePayload`)
- Modify: `src/lib/leaderboard.ts` (export the existing `companyNameFromDomain` helper so we don't duplicate it)

DB-touching → covered by the Task 7 smoke test.

- [ ] **Step 1: Export the company-name helper** — in `src/lib/leaderboard.ts`, change `function companyNameFromDomain(` to `export function companyNameFromDomain(` (line ~39).

- [ ] **Step 2: Append `fetchScorePayload`** to `src/lib/api/score-payload.ts`:

```ts
import { db } from "@/db";
import { evaluations, scoreItems, recommendationResponses, users } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { canonicalizeLinkedinUrl } from "@/lib/canonicalize";
import { computePercentile, companyNameFromDomain } from "@/lib/leaderboard";

type RecsBlob = { summary?: string; items?: Array<{ id: string; text: string; category: string }> };
type ProfileBlob = {
  primaryCompanyDomain?: string | null;
  extractedMetrics?: { partnerAtFirm?: string | null } | null;
};

// Look up an already-scored person by LinkedIn URL and assemble the public
// payload. Returns null when the URL is invalid or we've never scored them.
// `opts` lets the paid path (Phase 2) mark the result uncached + the charge.
export async function fetchScorePayload(
  rawUrl: string,
  opts?: { cached?: boolean; chargedCents?: number },
): Promise<ReturnType<typeof buildScorePayload> | null> {
  const url = canonicalizeLinkedinUrl(rawUrl);
  if (!url) return null;

  const [row] = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      score: evaluations.score,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      signalQuality: evaluations.signalQuality,
      profile: evaluations.profile,
      recommendations: evaluations.recommendations,
      summaryStatus: evaluations.summaryStatus,
      summaryConfidence: evaluations.summaryConfidence,
      createdAt: evaluations.createdAt,
    })
    .from(evaluations)
    .where(eq(evaluations.linkedinUrl, url))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({
      rubric: scoreItems.rubric,
      reason: scoreItems.reason,
      points: scoreItems.points,
      confidence: scoreItems.confidence,
      status: scoreItems.status,
    })
    .from(scoreItems)
    .where(eq(scoreItems.evaluationId, row.id))
    .orderBy(asc(scoreItems.sortOrder));
  const toRow = (r: (typeof items)[number]): ScoreRow => ({
    reason: r.reason, points: r.points, confidence: r.confidence, status: r.status,
  });
  const founderRows = items.filter((r) => r.rubric === "founder").map(toRow);
  const investorRows = items.filter((r) => r.rubric === "investor").map(toRow);

  const responses = await db
    .select({ itemId: recommendationResponses.itemId, rating: recommendationResponses.rating })
    .from(recommendationResponses)
    .where(eq(recommendationResponses.evaluationId, row.id));
  const ratingByItem = new Map(responses.map((r) => [r.itemId, r.rating]));
  const recs = (row.recommendations as RecsBlob | null) ?? null;
  const priorities: PriorityRow[] = (recs?.items ?? []).map((it) => ({
    id: it.id, text: it.text, category: it.category, rating: ratingByItem.get(it.id) ?? null,
  }));
  const summary: SummaryBlock | null = recs?.summary
    ? { text: recs.summary, status: row.summaryStatus, confidence: row.summaryConfidence }
    : null;

  const [fP, iP, cP] = await Promise.all([
    computePercentile(row.founderScore, "founder"),
    computePercentile(row.investorScore, "investor"),
    computePercentile(row.score, "combined"),
  ]);

  const [claim] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.evaluationId, row.id), inArray(users.matchConfidence, ["high", "medium"])))
    .limit(1);

  const p = (row.profile as ProfileBlob | null) ?? null;
  const companyName =
    p?.extractedMetrics?.partnerAtFirm?.trim() || companyNameFromDomain(p?.primaryCompanyDomain);

  return buildScorePayload({
    linkedinUrl: row.linkedinUrl,
    fullName: row.fullName,
    companyName,
    claimed: !!claim,
    signalQuality: row.signalQuality,
    overall: { score: row.score, percentile: cP.percentile },
    founder: { score: row.founderScore, percentile: fP.percentile },
    investor: { score: row.investorScore, percentile: iP.percentile },
    founderRows,
    investorRows,
    summary,
    priorities,
    scoredAt: row.createdAt,
    cached: opts?.cached ?? true,
    chargedCents: opts?.chargedCents ?? 0,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `companyNameFromDomain` import errors, confirm Step 1's `export` was added.)

- [ ] **Step 4: Run the existing suite to confirm nothing broke**

Run: `pnpm test`
Expected: all tests pass (the leaderboard export change is additive).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/score-payload.ts src/lib/leaderboard.ts PRD/founder-score-api.md
git commit -m "feat(api): fetchScorePayload (gather score rows, recs, percentiles, claim)"
```

---

### Task 7: `GET /api/v1/score` route + manual smoke test

**Files:**
- Create: `src/app/api/v1/score/route.ts`

- [ ] **Step 1: Write the route:**

```ts
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { fetchScorePayload } from "@/lib/api/score-payload";
import { isValidLinkedinUrl } from "@/lib/canonicalize";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Per-key daily cap on free lookups — stops the whole scored DB being scraped
// for free. Env-tunable; conservative default.
const PER_DAY_LIMIT = Number(process.env.API_LOOKUP_PER_DAY_LIMIT) || 1000;

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  const linkedinUrl = new URL(req.url).searchParams.get("linkedin_url");
  if (!linkedinUrl || !isValidLinkedinUrl(linkedinUrl)) {
    return NextResponse.json({ error: "invalid linkedin_url" }, { status: 400 });
  }

  if (!(await checkAndIncrementRateLimit(`apikey:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  const payload = await fetchScorePayload(linkedinUrl);
  if (!payload) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(payload);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/api/v1/score/route.ts src/lib/api/score-payload.ts src/lib/api-keys.ts`
Expected: no errors.

- [ ] **Step 3: Manual smoke test** (dev server on :3000, using the key from Task 4 and a LinkedIn URL known to be scored — e.g. one from the leaderboard like `https://linkedin.com/in/jordan-lee`):

```bash
KEY="sk_live_…"   # from Task 4
# 401 without a key:
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/v1/score?linkedin_url=https://linkedin.com/in/jordan-lee"
# 200 with a key + scored person:
curl -s -H "Authorization: Bearer $KEY" "http://localhost:3000/api/v1/score?linkedin_url=https://linkedin.com/in/jordan-lee" | head -c 600
# 404 for an unknown person:
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" "http://localhost:3000/api/v1/score?linkedin_url=https://linkedin.com/in/definitely-not-scored-xyz"
# 400 for a bad url:
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" "http://localhost:3000/api/v1/score?linkedin_url=not-a-url"
```

Expected: `401` (no key) · a JSON body with `scores`, `founder_rows`, `what_you_likely_need`, `cached: true` (with key) · `404` (unknown) · `400` (bad url).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/score/route.ts PRD/founder-score-api.md
git commit -m "feat(api): GET /api/v1/score free cached lookup (auth + rate limit)"
```

---

## Self-review checklist (run after executing, before opening a PR)

- [ ] `pnpm test` green, `pnpm exec tsc --noEmit` clean, `pnpm exec eslint .` clean.
- [ ] A request with no/invalid/revoked key → 401; valid key + scored person → full payload; unknown → 404; bad url → 400; >limit → 429.
- [ ] Response contains NONE of: `usage`, `costUsd`, `publicEmail`, raw enrichment payloads.
- [ ] `PRD/founder-score-api.md` updated on each commit; migration applied to dev DB.

## Phase boundary

Phase 1 delivers the free read API end-to-end. **Do NOT** build billing or the dashboard here — those are Phase 2 (`POST /api/v1/score` + credits + Stripe) and Phase 3 (dashboard UI + Claude Code instructions file), each with its own plan.
