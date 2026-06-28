# Founder Festival MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the festival.so MVP: LinkedIn-URL entry → Exa+Claude eval → score reveal → Clerk-OAuth claim/verify.

**Architecture:** Next.js 16 App Router on Vercel. Single `/api/eval` orchestrator that calls Exa `/search` (`type: "deep"` with `outputSchema`), looks up Majestic Million domain ranks in Neon, then calls Claude via Vercel AI Gateway (`generateObject`) to produce score + breakdown + recommendations. Welcome page reads the persisted row. Bypass codes redeem atomically against `bypass_codes`. Claim flow runs Clerk OAuth and matches against the original eval's LinkedIn URL.

**Tech Stack:** Next.js 16 + App Router, TypeScript, Tailwind v4, Clerk v7, Drizzle ORM, Neon Postgres (HTTP driver), Vercel AI SDK v6, AI Gateway, exa-js, vitest, Vercel Cron.

**Reference spec:** `docs/superpowers/specs/2026-05-21-festival-mvp-design.md`

---

## File Structure (locked at plan time)

```
src/
  app/
    page.tsx                          # splash: LinkedIn URL input + code toggle
    welcome/page.tsx                  # score reveal (server component, reads ?e=<id>)
    not-this-round/page.tsx           # low-signal branch
    claim/page.tsx                    # provider selection (LinkedIn|GitHub|Email)
    claim/callback/route.ts           # OAuth callback → identity match
    verified/page.tsx                 # "events coming soon"
    api/
      eval/route.ts                   # POST {linkedinUrl} → {evaluationId, status}
      redeem/route.ts                 # POST {code}       → {evaluationId, assignedScore}
      rescore/route.ts                # POST {evaluationId} → re-run pipeline
      claim/match/route.ts            # POST → server-side match algorithm
      cron/refresh-mm/route.ts        # GET (cron-authed) → upsert MM
    layout.tsx                        # existing — keep
  db/
    schema.ts                         # all 6 tables (overwrite existing placeholder)
    index.ts                          # existing — keep
    queries.ts                        # named query helpers used by routes
  lib/
    canonicalize.ts                   # linkedin URL normalize
    rate-limit.ts                     # Neon-backed N/IP/day check
    exa.ts                            # exa client + PROFILE_SCHEMA
    scoring.ts                        # scoring rubric prompt + SCORING_SCHEMA
    eval-pipeline.ts                  # orchestrator: exa → mm → claude → persist
    identity-match.ts                 # match algo for /claim
    mm-loader.ts                      # streamed CSV parse + batched upsert
    request-ip.ts                     # IP extraction from headers
  proxy.ts                            # existing — keep
  components/
    SplashForm.tsx                    # client component: URL + code inputs
    ScoreTable.tsx                    # client component: breakdown table
    ReScoreButton.tsx                 # client component: top-right re-eval
scripts/
  bootstrap-mm.ts                     # one-time load from scripts/data/*.csv
  insert-code.ts                      # CLI helper to insert bypass codes
docs/
  admin-codes.md                      # how to mint codes (SQL + script)
tests/
  lib/canonicalize.test.ts
  lib/rate-limit.test.ts
  lib/scoring.test.ts                 # scoring math (deterministic from Claude output)
  lib/identity-match.test.ts
  lib/eval-pipeline.test.ts           # with Exa + Claude mocked
  api/eval.test.ts
  api/redeem.test.ts
```

---

## Task 1: Install missing dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime + dev deps**

```bash
pnpm add ai @ai-sdk/anthropic exa-js zod
pnpm add -D vitest @vitest/coverage-v8 @types/node tsx
```

(`ai` = Vercel AI SDK v6, used with model string `"anthropic/claude-opus-4-7"` via AI Gateway. `@ai-sdk/anthropic` ships the provider package the gateway resolves against — install both for type safety even though we route through the gateway. `tsx` runs TypeScript scripts directly.)

- [ ] **Step 2: Add scripts**

Add to `package.json` "scripts":
```json
"test": "vitest run",
"test:watch": "vitest",
"bootstrap-mm": "tsx scripts/bootstrap-mm.ts",
"insert-code": "tsx scripts/insert-code.ts"
```

- [ ] **Step 3: Configure vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Create `tests/setup.ts`:
```ts
import { config } from "dotenv";
config({ path: ".env.local" });
```

- [ ] **Step 4: Verify pnpm install + vitest runs**

```bash
pnpm install
pnpm exec vitest --version
```

Expected: vitest prints version.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/setup.ts PRD/main.md
git commit -m "Add vitest, AI SDK, Exa client, zod"
```

(Don't forget to prepend a PRD entry per project workflow.)

---

## Task 2: Database schema — all 6 tables

**Files:**
- Modify: `src/db/schema.ts` (replace placeholder `interest` table)

- [ ] **Step 1: Replace schema with all 6 tables**

```ts
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  date,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkedinUrl: text("linkedin_url").notNull(),
    fullName: text("full_name"),
    score: integer("score").notNull(),
    signalQuality: text("signal_quality").notNull(), // 'high' | 'medium' | 'low'
    breakdown: jsonb("breakdown").$type<Array<{ points: number; reason: string }>>(),
    profile: jsonb("profile"),
    companyStage: text("company_stage"),
    recommendations: jsonb("recommendations").$type<{
      summary: string;
      items: Array<{ id: string; text: string; category: string }>;
    }>(),
    exaGrounding: jsonb("exa_grounding"),
    pricing: jsonb("pricing").default(sql`'{}'::jsonb`),
    source: text("source").notNull(), // 'url' | 'code'
    sourceCode: text("source_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    linkedinUrlUnique: uniqueIndex("evaluations_linkedin_url_unique").on(t.linkedinUrl),
    sourceCodeIdx: index("evaluations_source_code_idx").on(t.sourceCode),
  }),
);

export const bypassCodes = pgTable(
  "bypass_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    maxUses: integer("max_uses").notNull(),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    assignedScore: integer("assigned_score"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    codeLowerUnique: uniqueIndex("bypass_codes_code_lower_unique").on(sql`lower(${t.code})`),
  }),
);

export const majesticMillion = pgTable(
  "majestic_million",
  {
    rank: integer("rank").primaryKey(),
    domain: text("domain").notNull(),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    domainIdx: index("majestic_million_domain_idx").on(t.domain),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    evaluationId: uuid("evaluation_id").references(() => evaluations.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedVia: text("verified_via"), // 'linkedin' | 'github' | 'email'
    matchConfidence: text("match_confidence"), // 'high' | 'medium' | 'low'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clerkUserIdUnique: uniqueIndex("users_clerk_user_id_unique").on(t.clerkUserId),
    evaluationIdx: index("users_evaluation_id_idx").on(t.evaluationId),
  }),
);

export const recommendationResponses = pgTable(
  "recommendation_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id),
    itemId: text("item_id").notNull(),
    rating: integer("rating").notNull(), // 1..4
    editedText: text("edited_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evalItemUnique: uniqueIndex("recommendation_responses_eval_item_unique").on(
      t.evaluationId,
      t.itemId,
    ),
  }),
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    ip: text("ip").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ip, t.day] }),
  }),
);
```

- [ ] **Step 2: Push schema to Neon**

```bash
pnpm db:push
```

Expected: Drizzle prompts (or auto-applies) → "Changes applied". The old `interest` table will be dropped (it had no real data).

- [ ] **Step 3: Verify in Neon (psql-style sanity check via Drizzle Studio)**

```bash
pnpm db:studio
```

(Open browser, confirm 6 tables present. Close studio after.)

- [ ] **Step 4: Commit**

Update PRD/main.md, then:
```bash
git add src/db/schema.ts PRD/main.md
git commit -m "Add festival data model: evaluations, bypass_codes, majestic_million, users, recommendation_responses, rate_limit"
```

---

## Task 3: LinkedIn URL canonicalization

**Files:**
- Create: `src/lib/canonicalize.ts`
- Create: `tests/lib/canonicalize.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/canonicalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { canonicalizeLinkedinUrl, isValidLinkedinUrl } from "@/lib/canonicalize";

describe("canonicalizeLinkedinUrl", () => {
  it("lowercases and strips trailing slash", () => {
    expect(canonicalizeLinkedinUrl("https://www.LinkedIn.com/in/JohnDoe/")).toBe(
      "https://linkedin.com/in/johndoe",
    );
  });
  it("strips query and hash", () => {
    expect(canonicalizeLinkedinUrl("https://linkedin.com/in/jane?utm=x#about")).toBe(
      "https://linkedin.com/in/jane",
    );
  });
  it("strips www subdomain", () => {
    expect(canonicalizeLinkedinUrl("https://www.linkedin.com/in/jane")).toBe(
      "https://linkedin.com/in/jane",
    );
  });
  it("returns null for non-LinkedIn URLs", () => {
    expect(canonicalizeLinkedinUrl("https://twitter.com/jane")).toBeNull();
  });
  it("returns null for garbage", () => {
    expect(canonicalizeLinkedinUrl("not a url")).toBeNull();
  });
});

describe("isValidLinkedinUrl", () => {
  it("accepts canonical form", () => {
    expect(isValidLinkedinUrl("https://linkedin.com/in/jane")).toBe(true);
  });
  it("rejects /company URLs", () => {
    expect(isValidLinkedinUrl("https://linkedin.com/company/acme")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm test tests/lib/canonicalize.test.ts
```

Expected: 6 failures, "Cannot find module '@/lib/canonicalize'".

- [ ] **Step 3: Implement**

`src/lib/canonicalize.ts`:
```ts
const LINKEDIN_HANDLE = /^\/in\/[^/]+\/?$/;

export function canonicalizeLinkedinUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com") return null;
  const path = url.pathname.toLowerCase().replace(/\/$/, "");
  if (!LINKEDIN_HANDLE.test(path + "/") && !LINKEDIN_HANDLE.test(path)) return null;
  return `https://linkedin.com${path}`;
}

export function isValidLinkedinUrl(input: string): boolean {
  return canonicalizeLinkedinUrl(input) !== null;
}
```

- [ ] **Step 4: Verify passing**

```bash
pnpm test tests/lib/canonicalize.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

Update PRD/main.md, then:
```bash
git add src/lib/canonicalize.ts tests/lib/canonicalize.test.ts PRD/main.md
git commit -m "Canonicalize and validate LinkedIn URLs"
```

---

## Task 4: Request-IP helper

**Files:**
- Create: `src/lib/request-ip.ts`

- [ ] **Step 1: Implement**

`src/lib/request-ip.ts`:
```ts
export function getRequestIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "0.0.0.0";
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/request-ip.ts
git commit -m "Extract caller IP from forwarding headers"
```

(Trivial; skip dedicated tests — exercised through rate-limit tests next.)

---

## Task 5: Rate-limit utility

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `tests/lib/rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

`tests/lib/rate-limit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";

describe("rate-limit", () => {
  const testIp = "test-ip-127.0.0.1";

  beforeEach(async () => {
    await db.delete(rateLimit).where(eq(rateLimit.ip, testIp));
  });

  it("allows up to N and blocks N+1", async () => {
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(true);
    expect(await checkAndIncrementRateLimit(testIp, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/rate-limit.ts`:
```ts
import { db } from "@/db";
import { rateLimit } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function checkAndIncrementRateLimit(
  ip: string,
  perDay: number,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await db.execute(sql`
    INSERT INTO rate_limit (ip, day, count)
    VALUES (${ip}, ${today}, 1)
    ON CONFLICT (ip, day)
    DO UPDATE SET count = rate_limit.count + 1
    RETURNING count
  `);
  const count = Number((result as unknown as { rows: Array<{ count: number }> }).rows[0]?.count ?? 0);
  return count <= perDay;
}
```

- [ ] **Step 3: Run test**

```bash
pnpm test tests/lib/rate-limit.test.ts
```

Expected: passes (hits live Neon dev DB).

- [ ] **Step 4: Commit**

```bash
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts PRD/main.md
git commit -m "Add Neon-backed per-IP daily rate limit"
```

---

## Task 6: Exa client + PROFILE_SCHEMA

**Files:**
- Create: `src/lib/exa.ts`
- Modify: `.env.example` (create if missing)

- [ ] **Step 1: Create .env.example**

`.env.example`:
```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXA_API_KEY=
AI_GATEWAY_API_KEY=
MM_REFRESH_SECRET=
```

- [ ] **Step 2: Implement exa.ts**

`src/lib/exa.ts`:
```ts
import Exa from "exa-js";

export const PROFILE_SCHEMA = {
  type: "object",
  description: "Structured profile data extracted from the public web for a LinkedIn URL",
  required: ["fullName", "signalQuality"],
  properties: {
    fullName: { type: "string", description: "Person's full name as it appears publicly" },
    headline: { type: "string", description: "Their public headline / tagline if findable" },
    isCurrentFounder: { type: "boolean", description: "Currently founder/CEO of a company" },
    isPastFounder: { type: "boolean", description: "Founded a company in the past (now exited or moved on)" },
    currentCompany: {
      type: "object",
      properties: {
        name: { type: "string" },
        domain: { type: "string", description: "Root domain like acme.com" },
        stage: {
          type: "string",
          description:
            "idea | pre-seed | seed | series-a | series-b | series-c+ | growth | public | acquired | n/a",
        },
        isProfitable: { type: "boolean" },
        raisedUsd: { type: "number", description: "Total raised in USD, 0 if unknown" },
        yc: { type: "boolean", description: "Went through Y Combinator" },
        hadCofounders: { type: "boolean" },
      },
    },
    pastCompanies: {
      type: "array",
      description: "Past companies founded (not employed at)",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
          exited: { type: "boolean", description: "Sold, acquired, or wound down successfully" },
          raisedUsd: { type: "number" },
          yc: { type: "boolean" },
          hadCofounders: { type: "boolean" },
        },
      },
    },
    githubUrls: {
      type: "array",
      description: "Any github.com URLs associated with this person, for later identity matching",
      items: { type: "string" },
    },
    signalQuality: {
      type: "string",
      description:
        "How confident is this extraction: high (plenty of corroborating sources), medium (some sources), low (almost no public info found)",
    },
  },
} as const;

export type ExaProfile = {
  fullName: string;
  headline?: string;
  isCurrentFounder?: boolean;
  isPastFounder?: boolean;
  currentCompany?: {
    name?: string;
    domain?: string;
    stage?: string;
    isProfitable?: boolean;
    raisedUsd?: number;
    yc?: boolean;
    hadCofounders?: boolean;
  };
  pastCompanies?: Array<{
    name?: string;
    domain?: string;
    exited?: boolean;
    raisedUsd?: number;
    yc?: boolean;
    hadCofounders?: boolean;
  }>;
  githubUrls?: string[];
  signalQuality: "high" | "medium" | "low";
};

export function getExaClient() {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not set");
  return new Exa(key);
}

export async function researchLinkedinProfile(linkedinUrl: string): Promise<{
  profile: ExaProfile;
  grounding: unknown;
}> {
  const exa = getExaClient();
  const query = `${linkedinUrl} founder profile background companies funding raised exits Y Combinator`;
  const result = (await exa.search(query, {
    type: "deep",
    numResults: 10,
    // @ts-expect-error: outputSchema is supported by exa-js even when not yet in types
    outputSchema: PROFILE_SCHEMA,
    contents: { highlights: true },
  })) as unknown as {
    output?: { content: ExaProfile; grounding: unknown };
  };
  if (!result.output?.content) {
    return {
      profile: { fullName: "", signalQuality: "low" },
      grounding: null,
    };
  }
  return { profile: result.output.content, grounding: result.output.grounding };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/exa.ts .env.example PRD/main.md
git commit -m "Add Exa client and structured PROFILE_SCHEMA"
```

---

## Task 7: Scoring module — prompt, schema, deterministic math test

**Files:**
- Create: `src/lib/scoring.ts`
- Create: `tests/lib/scoring.test.ts`

- [ ] **Step 1: Implement scoring.ts**

`src/lib/scoring.ts`:
```ts
import { z } from "zod";
import type { ExaProfile } from "./exa";

export const SCORING_RUBRIC = `
Apply each rule below to the profile. For each rule that triggers, emit ONE row
in the breakdown array with the integer point value and a single-sentence reason
written in plain English referencing specific facts from the profile.

Rules:
- Past founder: +5
- Current founder: +10
- Venture raised: +10 for every full $1,000,000 raised across current + past companies
- Y Combinator alum: +10 (any company)
- Exit / sold company: +10 per distinct exit in pastCompanies (exited: true)
- Current company is profitable: +10
- Any of the above had co-founders: +5 (apply once total, not per company)
- If they founded a company (current OR past), use the highest-ranked company on
  Majestic Million. Score = min(100, floor(10000 / rank)). Provided as
  founderMMRank below (null if none of their companies rank).
- If they are NOT a founder but currently work at a company, use the current
  company's rank. Score = floor(min(100, 10000 / rank) * 0.1).
  Provided as employeeMMRank below.

After applying all rules, the final score MUST equal the sum of all breakdown
points. If a rule does not apply, do not include a row for it.

Also generate:
- recommendations.summary: 2-3 sentences in second person about what THIS founder
  most likely needs right now, grounded in their stage and profile.
- recommendations.items: 5-8 specific, actionable suggestions tied to their
  current situation. Each item has a stable id (slug), one-sentence text,
  category in: 'fundraising' | 'hiring' | 'intros' | 'tactical' |
  'positioning' | 'wellbeing'.

If signal is too thin to score (no fullName, no headline, no companies),
return signal_quality 'low' and an empty breakdown with score 0.
`;

export const SCORING_SCHEMA = z.object({
  score: z.number().int(),
  signalQuality: z.enum(["high", "medium", "low"]),
  companyStage: z.string().nullable(),
  breakdown: z.array(
    z.object({
      points: z.number().int(),
      reason: z.string(),
    }),
  ),
  recommendations: z.object({
    summary: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        category: z.enum([
          "fundraising",
          "hiring",
          "intros",
          "tactical",
          "positioning",
          "wellbeing",
        ]),
      }),
    ),
  }),
});

export type ScoringResult = z.infer<typeof SCORING_SCHEMA>;

export type MMLookup = {
  founderMMRank: number | null;
  employeeMMRank: number | null;
};

export function buildScoringPrompt(profile: ExaProfile, mm: MMLookup): string {
  return [
    SCORING_RUBRIC,
    "",
    "PROFILE:",
    JSON.stringify(profile, null, 2),
    "",
    "MAJESTIC MILLION CONTEXT:",
    `founderMMRank: ${mm.founderMMRank}`,
    `employeeMMRank: ${mm.employeeMMRank}`,
  ].join("\n");
}

export function validateBreakdownSumsToScore(r: ScoringResult): boolean {
  const sum = r.breakdown.reduce((a, b) => a + b.points, 0);
  return sum === r.score;
}
```

- [ ] **Step 2: Write tests**

`tests/lib/scoring.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateBreakdownSumsToScore, buildScoringPrompt } from "@/lib/scoring";

describe("validateBreakdownSumsToScore", () => {
  it("returns true when sum matches", () => {
    expect(
      validateBreakdownSumsToScore({
        score: 25,
        signalQuality: "high",
        companyStage: "seed",
        breakdown: [
          { points: 10, reason: "current founder" },
          { points: 10, reason: "YC" },
          { points: 5, reason: "co-founders" },
        ],
        recommendations: { summary: "x", items: [] },
      }),
    ).toBe(true);
  });
  it("returns false when sum does not match", () => {
    expect(
      validateBreakdownSumsToScore({
        score: 30,
        signalQuality: "high",
        companyStage: null,
        breakdown: [{ points: 10, reason: "x" }],
        recommendations: { summary: "x", items: [] },
      }),
    ).toBe(false);
  });
});

describe("buildScoringPrompt", () => {
  it("embeds the profile and MM context", () => {
    const prompt = buildScoringPrompt(
      { fullName: "Jane", signalQuality: "high" },
      { founderMMRank: 1234, employeeMMRank: null },
    );
    expect(prompt).toContain("founderMMRank: 1234");
    expect(prompt).toContain("Jane");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/lib/scoring.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scoring.ts tests/lib/scoring.test.ts PRD/main.md
git commit -m "Scoring rubric prompt + Zod schema + sum validator"
```

---

## Task 8: MM CSV loader

**Files:**
- Create: `src/lib/mm-loader.ts`
- Create: `scripts/bootstrap-mm.ts`

- [ ] **Step 1: Implement mm-loader.ts**

`src/lib/mm-loader.ts`:
```ts
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { db } from "@/db";
import { majesticMillion } from "@/db/schema";
import { sql } from "drizzle-orm";

type Row = { rank: number; domain: string };

export async function* parseMajesticCsv(path: string): AsyncGenerator<Row> {
  const stream = createReadStream(path, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of rl) {
    const cells = line.split(",");
    if (!header) {
      header = cells.map((c) => c.trim());
      continue;
    }
    const rankIdx = header.indexOf("GlobalRank");
    const domainIdx = header.indexOf("Domain");
    if (rankIdx < 0 || domainIdx < 0) throw new Error("CSV missing expected columns");
    const rank = Number(cells[rankIdx]);
    const domain = (cells[domainIdx] || "").trim().toLowerCase();
    if (!Number.isFinite(rank) || !domain) continue;
    yield { rank, domain };
  }
}

export async function upsertBatch(rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  // Use raw SQL for fast multi-value upsert.
  const values = rows
    .map((r, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`)
    .join(",");
  const params = rows.flatMap((r) => [r.rank, r.domain]);
  await db.execute(
    sql.raw(
      `INSERT INTO majestic_million (rank, domain, refreshed_at) VALUES ${values}
       ON CONFLICT (rank) DO UPDATE SET domain = EXCLUDED.domain, refreshed_at = EXCLUDED.refreshed_at`,
      params,
    ),
  );
}

export async function loadCsvIntoNeon(path: string, batchSize = 5000): Promise<number> {
  let batch: Row[] = [];
  let total = 0;
  for await (const row of parseMajesticCsv(path)) {
    batch.push(row);
    if (batch.length >= batchSize) {
      await upsertBatch(batch);
      total += batch.length;
      batch = [];
      // eslint-disable-next-line no-console
      console.log(`upserted ${total} rows`);
    }
  }
  if (batch.length > 0) {
    await upsertBatch(batch);
    total += batch.length;
  }
  return total;
}
```

(Note: `db.execute(sql.raw(...))` here is a placeholder pattern; Drizzle's neon-http driver doesn't accept parameter arrays on `sql.raw`. Use the proper `sql` template tag instead — replace with the working idiom below.)

Actually, replace `upsertBatch` with:
```ts
export async function upsertBatch(rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(majesticMillion)
    .values(rows.map((r) => ({ rank: r.rank, domain: r.domain })))
    .onConflictDoUpdate({
      target: majesticMillion.rank,
      set: {
        domain: sql`EXCLUDED.domain`,
        refreshedAt: sql`NOW()`,
      },
    });
}
```

- [ ] **Step 2: Implement bootstrap-mm.ts**

`scripts/bootstrap-mm.ts`:
```ts
import { loadCsvIntoNeon } from "@/lib/mm-loader";
import path from "node:path";
import { existsSync } from "node:fs";

async function main() {
  const csvPath = path.resolve("scripts/data/majestic_million.csv");
  if (!existsSync(csvPath)) {
    console.error(`Missing ${csvPath}. Download from https://downloads.majestic.com/majestic_million.csv`);
    process.exit(1);
  }
  console.time("load");
  const n = await loadCsvIntoNeon(csvPath);
  console.timeEnd("load");
  console.log(`loaded ${n} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Run bootstrap**

```bash
pnpm bootstrap-mm
```

Expected: streams the CSV, logs progress every 5k rows, finishes near 1,000,000 rows. Takes a few minutes against Neon's HTTP driver.

- [ ] **Step 4: Verify in Neon**

```bash
pnpm exec tsx -e "import('./src/db').then(async ({db}) => { const r = await db.execute(\`SELECT COUNT(*)::int AS c FROM majestic_million\`); console.log(r); })"
```

Expected: count ~1,000,000.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mm-loader.ts scripts/bootstrap-mm.ts PRD/main.md
git commit -m "Streamed Majestic Million CSV loader + bootstrap script"
```

---

## Task 9: Eval orchestrator (Exa → MM → Claude → persist)

**Files:**
- Create: `src/lib/eval-pipeline.ts`
- Create: `tests/lib/eval-pipeline.test.ts`

- [ ] **Step 1: Implement eval-pipeline.ts**

`src/lib/eval-pipeline.ts`:
```ts
import { generateObject } from "ai";
import { z } from "zod";
import { researchLinkedinProfile, type ExaProfile } from "./exa";
import {
  SCORING_RUBRIC,
  SCORING_SCHEMA,
  buildScoringPrompt,
  validateBreakdownSumsToScore,
  type ScoringResult,
  type MMLookup,
} from "./scoring";
import { db } from "@/db";
import { evaluations, majesticMillion } from "@/db/schema";
import { canonicalizeLinkedinUrl } from "./canonicalize";
import { eq, inArray } from "drizzle-orm";

export type EvalStatus = "scored" | "low-signal";
export type EvalResult = {
  evaluationId: string;
  status: EvalStatus;
  score: number;
  breakdown: ScoringResult["breakdown"];
};

async function lookupMmRanks(profile: ExaProfile): Promise<MMLookup> {
  const founderDomains = [
    ...(profile.currentCompany && (profile.isCurrentFounder || profile.isPastFounder)
      ? [profile.currentCompany.domain]
      : []),
    ...(profile.pastCompanies?.map((c) => c.domain) ?? []),
  ].filter((d): d is string => !!d);

  const employeeDomain = !profile.isCurrentFounder ? profile.currentCompany?.domain : null;
  const allDomains = [...new Set([...founderDomains, ...(employeeDomain ? [employeeDomain] : [])])];

  if (allDomains.length === 0) return { founderMMRank: null, employeeMMRank: null };

  const rows = await db
    .select()
    .from(majesticMillion)
    .where(inArray(majesticMillion.domain, allDomains));
  const byDomain = new Map(rows.map((r) => [r.domain, r.rank]));
  const founderRanks = founderDomains.map((d) => byDomain.get(d)).filter((r): r is number => !!r);
  const employeeRank = employeeDomain ? byDomain.get(employeeDomain) ?? null : null;

  return {
    founderMMRank: founderRanks.length > 0 ? Math.min(...founderRanks) : null,
    employeeMMRank: employeeRank ?? null,
  };
}

async function scoreWithClaude(profile: ExaProfile, mm: MMLookup): Promise<ScoringResult> {
  const { object } = await generateObject({
    model: "anthropic/claude-opus-4-7",
    schema: SCORING_SCHEMA,
    prompt: buildScoringPrompt(profile, mm),
    temperature: 0.2,
  });
  return object;
}

export async function runEval(rawUrl: string, source: "url" | "code" = "url"): Promise<EvalResult> {
  const linkedinUrl = canonicalizeLinkedinUrl(rawUrl);
  if (!linkedinUrl) throw new Error("Invalid LinkedIn URL");

  // 1. Return cached eval if present
  const cached = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.linkedinUrl, linkedinUrl))
    .limit(1);
  if (cached.length > 0) {
    const row = cached[0]!;
    return {
      evaluationId: row.id,
      status: row.signalQuality === "low" ? "low-signal" : "scored",
      score: row.score,
      breakdown: (row.breakdown ?? []) as ScoringResult["breakdown"],
    };
  }

  // 2. Exa research
  const { profile, grounding } = await researchLinkedinProfile(linkedinUrl);

  // 3. Low-signal short-circuit
  if (profile.signalQuality === "low" || !profile.fullName) {
    const [row] = await db
      .insert(evaluations)
      .values({
        linkedinUrl,
        fullName: profile.fullName || null,
        score: 0,
        signalQuality: "low",
        breakdown: [],
        profile,
        exaGrounding: grounding,
        source,
      })
      .returning();
    return { evaluationId: row!.id, status: "low-signal", score: 0, breakdown: [] };
  }

  // 4. Majestic Million lookup
  const mm = await lookupMmRanks(profile);

  // 5. Claude scoring
  const scoring = await scoreWithClaude(profile, mm);
  if (!validateBreakdownSumsToScore(scoring)) {
    // Recover by trusting the breakdown sum.
    scoring.score = scoring.breakdown.reduce((a, b) => a + b.points, 0);
  }

  // 6. Persist
  const [row] = await db
    .insert(evaluations)
    .values({
      linkedinUrl,
      fullName: profile.fullName,
      score: scoring.score,
      signalQuality: scoring.signalQuality,
      breakdown: scoring.breakdown,
      profile,
      companyStage: scoring.companyStage,
      recommendations: scoring.recommendations,
      exaGrounding: grounding,
      source,
    })
    .returning();
  return {
    evaluationId: row!.id,
    status: scoring.signalQuality === "low" ? "low-signal" : "scored",
    score: scoring.score,
    breakdown: scoring.breakdown,
  };
}

export async function reEvaluate(evaluationId: string): Promise<EvalResult> {
  const [existing] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!existing) throw new Error("Evaluation not found");
  await db.delete(evaluations).where(eq(evaluations.id, evaluationId));
  return runEval(existing.linkedinUrl, existing.source as "url" | "code");
}
```

- [ ] **Step 2: Write a basic integration test (mocks Exa + Claude)**

`tests/lib/eval-pipeline.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/exa", () => ({
  researchLinkedinProfile: vi.fn(async () => ({
    profile: {
      fullName: "Jane Tester",
      isCurrentFounder: true,
      currentCompany: { name: "Acme", domain: "acme.test", stage: "seed", raisedUsd: 2_000_000 },
      pastCompanies: [],
      githubUrls: [],
      signalQuality: "high" as const,
    },
    grounding: { test: true },
  })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => ({
    object: {
      score: 30,
      signalQuality: "high" as const,
      companyStage: "seed",
      breakdown: [
        { points: 10, reason: "Currently founder of Acme" },
        { points: 20, reason: "Raised $2M for Acme" },
      ],
      recommendations: { summary: "x", items: [] },
    },
  })),
}));

import { runEval } from "@/lib/eval-pipeline";

describe("runEval", () => {
  const testUrl = "https://linkedin.com/in/jane-tester-eval";

  beforeEach(async () => {
    await db.delete(evaluations).where(eq(evaluations.linkedinUrl, testUrl));
  });

  it("scores a fresh LinkedIn URL end to end (with mocks)", async () => {
    const r = await runEval(testUrl);
    expect(r.status).toBe("scored");
    expect(r.score).toBe(30);
    expect(r.breakdown.length).toBe(2);
  });

  it("returns cached on repeat", async () => {
    await runEval(testUrl);
    const r = await runEval(testUrl);
    expect(r.score).toBe(30); // and no additional Exa/Claude calls (verify via mock if needed)
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test tests/lib/eval-pipeline.test.ts
```

Expected: passes against live Neon.

- [ ] **Step 4: Commit**

```bash
git add src/lib/eval-pipeline.ts tests/lib/eval-pipeline.test.ts PRD/main.md
git commit -m "Orchestrate eval: cache check, Exa research, MM lookup, Claude scoring, persist"
```

---

## Task 10: `/api/eval` route

**Files:**
- Create: `src/app/api/eval/route.ts`

- [ ] **Step 1: Implement**

`src/app/api/eval/route.ts`:
```ts
import { NextResponse } from "next/server";
import { runEval } from "@/lib/eval-pipeline";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { isValidLinkedinUrl } from "@/lib/canonicalize";

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { linkedinUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const url = body.linkedinUrl;
  if (!url || !isValidLinkedinUrl(url)) {
    return NextResponse.json({ error: "invalid linkedin url" }, { status: 400 });
  }
  const ip = getRequestIp(req.headers);
  const allowed = await checkAndIncrementRateLimit(ip, 3);
  if (!allowed) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  try {
    const result = await runEval(url, "url");
    return NextResponse.json(result);
  } catch (err) {
    console.error("eval failed", err);
    return NextResponse.json({ error: "eval failed" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/eval/route.ts PRD/main.md
git commit -m "POST /api/eval route with rate-limit and URL validation"
```

---

## Task 11: `/api/redeem` route + atomic decrement

**Files:**
- Create: `src/app/api/redeem/route.ts`
- Create: `tests/api/redeem.test.ts`

- [ ] **Step 1: Implement route**

`src/app/api/redeem/route.ts`:
```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bypassCodes, evaluations } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const code = body.code?.trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  // Atomic claim: only succeeds if not revoked, not expired, has uses left.
  const claimed = await db.execute<{ id: string; assigned_score: number | null; code: string }>(sql`
    UPDATE bypass_codes
       SET uses_count = uses_count + 1
     WHERE lower(code) = lower(${code})
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
       AND uses_count < max_uses
     RETURNING id, assigned_score, code
  `);
  const row = (claimed as unknown as { rows: Array<{ id: string; assigned_score: number | null; code: string }> }).rows[0];
  if (!row) return NextResponse.json({ error: "invalid or used code" }, { status: 400 });

  // Create an evaluation row representing this entry (no LinkedIn URL).
  const placeholderUrl = `code:${row.id}`;
  const score = row.assigned_score ?? 0;
  const [evalRow] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: placeholderUrl,
      score,
      signalQuality: "medium",
      breakdown: [],
      source: "code",
      sourceCode: row.code,
    })
    .returning();

  return NextResponse.json({ evaluationId: evalRow!.id, assignedScore: score, status: "redeemed" });
}
```

- [ ] **Step 2: Write test**

`tests/api/redeem.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { bypassCodes, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/redeem/route";

describe("POST /api/redeem", () => {
  const code = "TEST-CODE-X1";

  beforeAll(async () => {
    await db.delete(bypassCodes).where(eq(bypassCodes.code, code));
    await db.insert(bypassCodes).values({ code, maxUses: 2, assignedScore: 50 });
  });

  afterAll(async () => {
    await db.delete(evaluations).where(eq(evaluations.sourceCode, code));
    await db.delete(bypassCodes).where(eq(bypassCodes.code, code));
  });

  it("redeems a valid code", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ code }) }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.assignedScore).toBe(50);
    expect(json.evaluationId).toBeDefined();
  });

  it("rejects invalid code", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ code: "NOPE" }) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test, then commit**

```bash
pnpm test tests/api/redeem.test.ts
git add src/app/api/redeem/route.ts tests/api/redeem.test.ts PRD/main.md
git commit -m "POST /api/redeem with atomic code claim"
```

---

## Task 12: `/api/rescore` route

**Files:**
- Create: `src/app/api/rescore/route.ts`

- [ ] **Step 1: Implement**

`src/app/api/rescore/route.ts`:
```ts
import { NextResponse } from "next/server";
import { reEvaluate } from "@/lib/eval-pipeline";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { evaluationId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (!body.evaluationId) return NextResponse.json({ error: "evaluationId required" }, { status: 400 });

  const ip = getRequestIp(req.headers);
  if (!(await checkAndIncrementRateLimit(ip, 3))) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  try {
    return NextResponse.json(await reEvaluate(body.evaluationId));
  } catch (err) {
    console.error("rescore failed", err);
    return NextResponse.json({ error: "rescore failed" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/rescore/route.ts PRD/main.md
git commit -m "POST /api/rescore"
```

---

## Task 13: Splash page (`/`) + SplashForm component

**Files:**
- Modify: `src/app/page.tsx` (replace current content)
- Create: `src/components/SplashForm.tsx`

- [ ] **Step 1: Implement SplashForm**

`src/components/SplashForm.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SplashForm() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const url = `https://linkedin.com/in/${handle.trim().replace(/^\/+|\/+$/g, "")}`;
    setBusy(true);
    const res = await fetch("/api/eval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkedinUrl: url }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Something went wrong");
      return;
    }
    if (json.status === "low-signal") {
      router.push("/not-this-round");
      return;
    }
    router.push(`/welcome?e=${json.evaluationId}`);
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setError(json.error || "Invalid code"); return; }
    router.push(`/welcome?e=${json.evaluationId}`);
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-6">
      <form onSubmit={submitUrl} className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Enter your LinkedIn
        </label>
        <div className="flex items-stretch border border-zinc-800 rounded-md overflow-hidden bg-black">
          <span className="px-3 py-3 text-zinc-500 select-none border-r border-zinc-800 text-sm whitespace-nowrap">
            https://linkedin.com/in/
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="your-handle"
            className="flex-1 px-3 py-3 bg-transparent text-zinc-100 placeholder:text-zinc-600 outline-none text-sm"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={busy || handle.trim() === ""}
          className="rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
        >
          {busy ? "Working…" : "Continue"}
        </button>
      </form>
      {!showCode ? (
        <button
          onClick={() => setShowCode(true)}
          className="text-xs text-zinc-500 hover:text-zinc-300 self-center"
        >
          Have an invite code?
        </button>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Invite code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-3 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy || code.trim() === ""}
            className="rounded-md bg-white text-black font-medium py-3 disabled:opacity-40"
          >
            Enter
          </button>
        </form>
      )}
      {error && <div className="text-sm text-red-400 text-center">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Replace page.tsx**

`src/app/page.tsx`:
```tsx
import { SplashForm } from "@/components/SplashForm";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-black text-zinc-100 px-6 py-12 gap-12 relative overflow-hidden">
      <img
        src="/tent.png"
        alt=""
        aria-hidden
        className="absolute inset-0 m-auto w-[80vmin] max-w-[640px] opacity-[0.08] grayscale blur-[2px] pointer-events-none select-none"
      />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">festival.so</p>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">Founder Festival</h1>
      </div>
      <div className="relative">
        <SplashForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add tent.png placeholder**

Save one of the user's logo PNGs (the gold-on-white tent from the brief) to `public/tent.png`. For MVP, write a placeholder text file commit and treat the image swap as a manual follow-up:

```bash
# Operator drops the chosen logo into public/tent.png manually.
# If absent, the splash still renders cleanly — img just 404s and the layout is fine.
```

- [ ] **Step 4: Update layout to remove Clerk's `<ClerkProvider>` from `/` only? No — leave it; Clerk's provider is harmless on routes that don't use it.**

- [ ] **Step 5: Build to confirm**

```bash
pnpm build
```

Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/SplashForm.tsx PRD/main.md
git commit -m "Splash page: shadowy tent + LinkedIn URL form + invite code"
```

---

## Task 14: Welcome page + ScoreTable + ReScoreButton

**Files:**
- Create: `src/app/welcome/page.tsx`
- Create: `src/components/ScoreTable.tsx`
- Create: `src/components/ReScoreButton.tsx`

- [ ] **Step 1: ScoreTable**

`src/components/ScoreTable.tsx`:
```tsx
type Row = { points: number; reason: string };

export function ScoreTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-zinc-500 text-sm italic text-center">
        You&apos;re in via invite code.
      </div>
    );
  }
  return (
    <table className="w-full max-w-2xl border-collapse text-sm">
      <thead>
        <tr className="text-zinc-500 text-xs uppercase tracking-[0.2em]">
          <th className="text-right py-2 pr-6 w-24">Points</th>
          <th className="text-left py-2">Reasoning</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-zinc-800">
            <td className="text-right py-3 pr-6 font-mono text-zinc-100">+{r.points}</td>
            <td className="py-3 text-zinc-300">{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: ReScoreButton**

`src/components/ReScoreButton.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReScoreButton({ evaluationId }: { evaluationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function rescore() {
    setBusy(true);
    const res = await fetch("/api/rescore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      alert(json.error || "Rescore failed");
      return;
    }
    if (json.status === "low-signal") router.push("/not-this-round");
    else router.push(`/welcome?e=${json.evaluationId}`);
    router.refresh();
  }
  return (
    <button
      onClick={rescore}
      disabled={busy}
      className="text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
    >
      {busy ? "Rescoring…" : "Re-Score Me"}
    </button>
  );
}
```

- [ ] **Step 3: Welcome page (server component)**

`src/app/welcome/page.tsx`:
```tsx
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ScoreTable } from "@/components/ScoreTable";
import { ReScoreButton } from "@/components/ReScoreButton";

type PageProps = { searchParams: Promise<{ e?: string }> };

export default async function WelcomePage({ searchParams }: PageProps) {
  const { e } = await searchParams;
  if (!e) redirect("/");
  const [row] = await db.select().from(evaluations).where(eq(evaluations.id, e)).limit(1);
  if (!row) redirect("/");
  if (row.signalQuality === "low" && row.source === "url") redirect("/not-this-round");

  const breakdown = (row.breakdown ?? []) as Array<{ points: number; reason: string }>;
  return (
    <div className="flex flex-col flex-1 px-6 py-10 bg-black text-zinc-100">
      <header className="flex justify-between items-center mb-16">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">festival.so</p>
        {row.source === "url" && <ReScoreButton evaluationId={row.id} />}
      </header>
      <main className="flex-1 flex flex-col items-center gap-10 max-w-2xl mx-auto w-full">
        <div className="text-center flex flex-col gap-4">
          <p className="text-2xl">Welcome.</p>
          <p className="text-lg text-zinc-400">
            Here&apos;s your Founder Festival Score:
          </p>
          <p className="text-7xl sm:text-9xl font-semibold tracking-tight tabular-nums">
            {row.score}
          </p>
        </div>
        <ScoreTable rows={breakdown} />
        <a
          href="/claim"
          className="mt-6 rounded-full bg-white text-black font-medium px-6 h-12 inline-flex items-center"
        >
          Show me the Festival events I qualify for →
        </a>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Build, commit**

```bash
pnpm build
git add src/app/welcome src/components/ScoreTable.tsx src/components/ReScoreButton.tsx PRD/main.md
git commit -m "Welcome page with score reveal, breakdown table, and Re-Score button"
```

---

## Task 15: `/not-this-round` page

**Files:**
- Create: `src/app/not-this-round/page.tsx`

- [ ] **Step 1: Implement**

`src/app/not-this-round/page.tsx`:
```tsx
export default function NotThisRoundPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-black text-zinc-100 px-6 py-12 gap-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">festival.so</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">
        We couldn&apos;t find enough public information about you.
      </h1>
      <p className="max-w-md text-zinc-400">
        Double-check the LinkedIn URL you entered, or try a different one.
      </p>
      <a href="/" className="mt-4 text-sm underline text-zinc-300 hover:text-white">
        ← Back to the start
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/not-this-round PRD/main.md
git commit -m "Not-this-round page for low-signal evaluations"
```

---

## Task 16: Identity match algorithm

**Files:**
- Create: `src/lib/identity-match.ts`
- Create: `tests/lib/identity-match.test.ts`

- [ ] **Step 1: Implement**

`src/lib/identity-match.ts`:
```ts
import type { ExaProfile } from "./exa";

export type ClerkClaim = {
  provider: "linkedin" | "github" | "email";
  // For LinkedIn: vanity/URL.
  linkedinUrl?: string;
  // For GitHub: username + display name.
  githubUsername?: string;
  githubDisplayName?: string;
  // For email magic link: full email.
  email?: string;
};

export function matchConfidence(
  claim: ClerkClaim,
  evaluationLinkedinUrl: string,
  profile: ExaProfile | null,
): "high" | "medium" | "low" {
  if (claim.provider === "linkedin") {
    if (!claim.linkedinUrl) return "low";
    return normalize(claim.linkedinUrl) === normalize(evaluationLinkedinUrl) ? "high" : "low";
  }
  if (claim.provider === "github") {
    if (!claim.githubUsername) return "low";
    const gh = (profile?.githubUrls ?? []).map((u) => u.toLowerCase());
    const u = claim.githubUsername.toLowerCase();
    const inProfile = gh.some((url) => url.includes(`github.com/${u}`));
    const nameMatch = !!(
      claim.githubDisplayName &&
      profile?.fullName &&
      claim.githubDisplayName.toLowerCase().trim() === profile.fullName.toLowerCase().trim()
    );
    return inProfile || nameMatch ? "medium" : "low";
  }
  if (claim.provider === "email") {
    if (!claim.email) return "low";
    const domain = claim.email.split("@")[1]?.toLowerCase();
    const target = profile?.currentCompany?.domain?.toLowerCase();
    if (!domain || !target) return "low";
    return domain === target || domain.endsWith(`.${target}`) ? "medium" : "low";
  }
  return "low";
}

function normalize(u: string): string {
  return u.trim().toLowerCase().replace(/\/$/, "").replace("www.", "");
}
```

- [ ] **Step 2: Tests**

`tests/lib/identity-match.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { matchConfidence } from "@/lib/identity-match";

const evalUrl = "https://linkedin.com/in/jane";

describe("matchConfidence", () => {
  it("LinkedIn exact = high", () => {
    expect(matchConfidence({ provider: "linkedin", linkedinUrl: evalUrl }, evalUrl, null)).toBe("high");
  });
  it("LinkedIn mismatch = low", () => {
    expect(matchConfidence({ provider: "linkedin", linkedinUrl: "https://linkedin.com/in/somebodyelse" }, evalUrl, null)).toBe("low");
  });
  it("GitHub URL in profile = medium", () => {
    const profile = {
      fullName: "Jane",
      signalQuality: "high" as const,
      githubUrls: ["https://github.com/jane-dev"],
    };
    expect(matchConfidence({ provider: "github", githubUsername: "jane-dev" }, evalUrl, profile)).toBe("medium");
  });
  it("GitHub name match = medium", () => {
    const profile = { fullName: "Jane Doe", signalQuality: "high" as const, githubUrls: [] };
    expect(matchConfidence({ provider: "github", githubUsername: "anything", githubDisplayName: "Jane Doe" }, evalUrl, profile)).toBe("medium");
  });
  it("work email domain matches current company = medium", () => {
    const profile = { fullName: "x", signalQuality: "high" as const, currentCompany: { domain: "acme.com" } };
    expect(matchConfidence({ provider: "email", email: "jane@acme.com" }, evalUrl, profile)).toBe("medium");
  });
  it("work email wrong domain = low", () => {
    const profile = { fullName: "x", signalQuality: "high" as const, currentCompany: { domain: "acme.com" } };
    expect(matchConfidence({ provider: "email", email: "jane@gmail.com" }, evalUrl, profile)).toBe("low");
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test tests/lib/identity-match.test.ts
git add src/lib/identity-match.ts tests/lib/identity-match.test.ts PRD/main.md
git commit -m "Identity match algorithm for claim flow"
```

---

## Task 17: Claim flow — pages + match route

**Files:**
- Create: `src/app/claim/page.tsx`
- Create: `src/app/claim/callback/route.ts`
- Create: `src/app/api/claim/match/route.ts`
- Create: `src/app/verified/page.tsx`

- [ ] **Step 1: `/claim` provider selection**

`src/app/claim/page.tsx`:
```tsx
import { SignInButton } from "@clerk/nextjs";

type PageProps = { searchParams: Promise<{ e?: string }> };

export default async function ClaimPage({ searchParams }: PageProps) {
  const { e } = await searchParams;
  const redirectUrl = `/claim/callback${e ? `?e=${e}` : ""}`;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-black text-zinc-100 px-6 py-12 gap-8 text-center">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
        Verify it&apos;s actually you.
      </h1>
      <p className="text-zinc-400 max-w-md text-sm">
        Choose how you&apos;d like to confirm your identity. We&apos;ll match
        against the profile you entered.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <SignInButton mode="modal" forceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl}>
          <button className="rounded-md bg-white text-black font-medium py-3">Continue with LinkedIn</button>
        </SignInButton>
        <SignInButton mode="modal" forceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl}>
          <button className="rounded-md border border-zinc-700 text-zinc-100 py-3">Continue with GitHub</button>
        </SignInButton>
        <SignInButton mode="modal" forceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl}>
          <button className="rounded-md border border-zinc-700 text-zinc-100 py-3">Continue with email</button>
        </SignInButton>
      </div>
    </div>
  );
}
```

(Implementation note: Clerk's `SignInButton mode="modal"` does NOT scope to a specific provider by default. For per-provider buttons, use Clerk's `useSignIn().authenticateWithRedirect({strategy: "oauth_linkedin_oidc"})` (etc.) client-side. See Step 1b below.)

- [ ] **Step 1b: Replace with per-provider client buttons**

Replace `src/app/claim/page.tsx` with:
```tsx
"use client";

import { useSignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

export default function ClaimPage() {
  const { signIn, isLoaded } = useSignIn();
  const params = useSearchParams();
  const e = params.get("e");
  const redirectUrl = `/claim/callback${e ? `?e=${e}` : ""}`;

  async function go(strategy: "oauth_linkedin_oidc" | "oauth_github" | "email_link") {
    if (!isLoaded || !signIn) return;
    if (strategy === "email_link") {
      // Email magic link flow needs an email; for MVP, skip and direct to oauth providers only.
      alert("Email flow coming soon — use LinkedIn or GitHub.");
      return;
    }
    await signIn.authenticateWithRedirect({
      strategy,
      redirectUrl: "/claim/sso-callback",
      redirectUrlComplete: redirectUrl,
    });
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-black text-zinc-100 px-6 py-12 gap-8 text-center">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
        Verify it&apos;s actually you.
      </h1>
      <p className="text-zinc-400 max-w-md text-sm">
        Choose how you&apos;d like to confirm your identity. We&apos;ll match
        against the profile you entered.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => go("oauth_linkedin_oidc")} className="rounded-md bg-white text-black font-medium py-3">Continue with LinkedIn</button>
        <button onClick={() => go("oauth_github")} className="rounded-md border border-zinc-700 text-zinc-100 py-3">Continue with GitHub</button>
        <button onClick={() => go("email_link")} className="rounded-md border border-zinc-700 text-zinc-100 py-3 opacity-60">Continue with email (soon)</button>
      </div>
    </div>
  );
}
```

Also create the Clerk SSO callback page `src/app/claim/sso-callback/page.tsx`:
```tsx
"use client";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
export default function Page() {
  return <AuthenticateWithRedirectCallback />;
}
```

- [ ] **Step 2: `/claim/callback` route — performs the match**

`src/app/claim/callback/route.ts`:
```ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { matchConfidence, type ClerkClaim } from "@/lib/identity-match";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/claim", req.url));

  const url = new URL(req.url);
  const evaluationId = url.searchParams.get("e");
  if (!evaluationId) return NextResponse.redirect(new URL("/", req.url));

  const [evalRow] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId)).limit(1);
  if (!evalRow) return NextResponse.redirect(new URL("/", req.url));

  const user = await currentUser();
  const claim = toClerkClaim(user);
  const confidence = matchConfidence(
    claim,
    evalRow.linkedinUrl,
    (evalRow.profile as never) ?? null,
  );

  await db
    .insert(users)
    .values({
      clerkUserId: userId,
      evaluationId,
      verifiedAt: new Date(),
      verifiedVia: claim.provider,
      matchConfidence: confidence,
    })
    .onConflictDoNothing();

  if (confidence === "high" || confidence === "medium") {
    return NextResponse.redirect(new URL("/verified", req.url));
  }
  return NextResponse.redirect(new URL(`/claim?e=${evaluationId}&denied=1`, req.url));
}

function toClerkClaim(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): ClerkClaim {
  const accounts = user.externalAccounts ?? [];
  const linkedin = accounts.find((a) => a.provider.startsWith("linkedin"));
  if (linkedin) {
    const vanity = (linkedin as unknown as { username?: string }).username;
    return {
      provider: "linkedin",
      linkedinUrl: vanity ? `https://linkedin.com/in/${vanity}` : undefined,
    };
  }
  const github = accounts.find((a) => a.provider.startsWith("github"));
  if (github) {
    return {
      provider: "github",
      githubUsername: (github as unknown as { username?: string }).username,
      githubDisplayName: [user.firstName, user.lastName].filter(Boolean).join(" "),
    };
  }
  const email = user.emailAddresses?.[0]?.emailAddress;
  return { provider: "email", email };
}
```

- [ ] **Step 3: `/verified` page**

`src/app/verified/page.tsx`:
```tsx
export default function VerifiedPage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-black text-zinc-100 px-6 py-12 gap-6 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">festival.so</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">
        You&apos;re verified.
      </h1>
      <p className="max-w-md text-zinc-400">
        Festival events are coming soon. We&apos;ll be in touch.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Update proxy.ts to allow `/claim/*` flow**

The current `proxy.ts` only protects `/dashboard(.*)`. Leave as-is — claim doesn't need protection (Clerk's `authenticateWithRedirect` handles its own session bootstrap).

- [ ] **Step 5: Build + commit**

```bash
pnpm build
git add src/app/claim src/app/verified PRD/main.md
git commit -m "Claim flow: provider buttons, SSO callback, identity-match, verified page"
```

---

## Task 18: MM weekly cron route

**Files:**
- Create: `src/app/api/cron/refresh-mm/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Implement cron route**

`src/app/api/cron/refresh-mm/route.ts`:
```ts
import { NextResponse } from "next/server";
import { loadCsvIntoNeon } from "@/lib/mm-loader";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.MM_REFRESH_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = "https://downloads.majestic.com/majestic_million.csv";
  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(tmpdir(), `mm-${Date.now()}.csv`);
  await writeFile(tmpPath, buf);

  const n = await loadCsvIntoNeon(tmpPath);
  return NextResponse.json({ ok: true, rows: n });
}
```

- [ ] **Step 2: Add vercel.json with cron + secret**

`vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/refresh-mm", "schedule": "0 3 * * 0" }
  ]
}
```

(Vercel automatically adds an `Authorization: Bearer <CRON_SECRET>` header when calling cron paths if `CRON_SECRET` is set in env. Our route accepts `MM_REFRESH_SECRET` for clarity — set both env vars to the same value, or rename to `CRON_SECRET` to use Vercel's built-in.)

- [ ] **Step 3: Generate the cron secret**

```bash
SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
printf "%s" "$SECRET" | vercel env add MM_REFRESH_SECRET development preview production
printf "%s" "$SECRET" | vercel env add CRON_SECRET development preview production
unset SECRET
vercel env pull .env.local --yes
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron PRD/main.md vercel.json
git commit -m "Weekly cron to refresh Majestic Million from downloads.majestic.com"
```

---

## Task 19: Admin docs + insert-code script

**Files:**
- Create: `docs/admin-codes.md`
- Create: `scripts/insert-code.ts`

- [ ] **Step 1: insert-code.ts**

`scripts/insert-code.ts`:
```ts
import { db } from "@/db";
import { bypassCodes } from "@/db/schema";

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [k, v] = arg.replace(/^--/, "").split("=");
      return [k, v];
    }),
  );
  const code = args.code;
  const maxUses = Number(args.maxUses ?? 1);
  const assignedScore = args.score ? Number(args.score) : undefined;
  const expiresAt = args.expires ? new Date(args.expires) : undefined;
  const note = args.note;
  if (!code) {
    console.error("Usage: pnpm insert-code --code=ABC123 --maxUses=5 --score=50 --expires=2026-07-01 --note='friends'");
    process.exit(1);
  }
  const [row] = await db
    .insert(bypassCodes)
    .values({ code, maxUses, assignedScore, expiresAt, note })
    .returning();
  console.log("inserted:", row);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: docs/admin-codes.md**

```md
# Admin: managing bypass invite codes

There is no admin UI yet. Use one of these paths to mint or revoke codes.

## Mint a code via script

\`\`\`bash
pnpm insert-code --code=FRIENDS-Q3 --maxUses=10 --score=50 --expires=2026-09-30 --note="early friends round"
\`\`\`

Flags:
- `--code` (required): the literal code string. Lookups are case-insensitive.
- `--maxUses` (default 1): how many redemptions allowed.
- `--score` (optional): assigns a baseline score to anyone who redeems this code. Used for content tiering.
- `--expires` (optional): ISO date — code stops working after this.
- `--note` (optional): free text for your records.

## Mint via SQL

\`\`\`sql
INSERT INTO bypass_codes (code, max_uses, assigned_score, expires_at, note)
VALUES ('FRIENDS-Q3', 10, 50, '2026-09-30', 'early friends round');
\`\`\`

## Revoke a code

\`\`\`sql
UPDATE bypass_codes SET revoked_at = NOW() WHERE code = 'FRIENDS-Q3';
\`\`\`

## See usage

\`\`\`sql
SELECT code, uses_count, max_uses, expires_at, revoked_at, assigned_score, note
FROM bypass_codes
ORDER BY created_at DESC;
\`\`\`
```

- [ ] **Step 3: Commit**

```bash
git add docs/admin-codes.md scripts/insert-code.ts PRD/main.md
git commit -m "Admin scripts and docs for managing bypass codes"
```

---

## Task 20: Deploy + verify

**Files:**
- Modify: anything needed to make `pnpm build` clean

- [ ] **Step 1: Final build sanity check**

```bash
pnpm build
```

Fix any TypeScript errors before deploying.

- [ ] **Step 2: Deploy**

```bash
vercel deploy --prod --yes --scope drodio1s-projects
```

- [ ] **Step 3: Check production**

- Visit `https://festival.so` — should show the dark splash with form
- Enter a real LinkedIn URL — should redirect to `/welcome` with a score
- Enter an invite code (mint one first via `pnpm insert-code` against the prod DB or via Drizzle Studio against the prod-linked Neon branch) — should show `/welcome` with no breakdown
- Verify `vercel domains inspect festival.so` shows no warnings

- [ ] **Step 4: Final commit + push**

```bash
git status
git push origin main
```

PRD/main.md should already be staged from prior commits.

---

## Out of scope (intentional)

- Stripe / variable membership fee. `evaluations.pricing` is reserved.
- Recommendation rating UI (Hell-No → Hell-Yes). Table exists; no page.
- Events page beyond `/verified` stub.
- Admin dashboard.
- Transactional email.
- Social share / OG image.
- Mobile-specific layout polish.
- A11y polish beyond Tailwind defaults.

These are explicitly listed in the spec's Section 11.

---

## Notes & known caveats

1. **`tent.png`** must be dropped into `public/tent.png` manually. If absent the splash still renders, the img just 404s.
2. **Clerk dashboard** needs LinkedIn + GitHub OAuth providers enabled — manual UI step. Without that, the `/claim` buttons produce a clear Clerk error.
3. **`EXA_API_KEY`** must be added to Vercel env vars. Without it `/api/eval` returns 503.
4. **`AI_GATEWAY_API_KEY`** is normally auto-provisioned by Vercel when AI SDK is detected, but may need a one-click enable in the Vercel dashboard.
5. **First MM bootstrap** must be run manually via `pnpm bootstrap-mm` against a Neon branch with the CSV staged at `scripts/data/majestic_million.csv`. After that, the weekly cron refreshes.
