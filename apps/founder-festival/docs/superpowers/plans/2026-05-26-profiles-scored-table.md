# "Profiles scored" table (source/cost/charge/user) + stored average cost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin/profiles` into a per-profile table showing Source (Web/Bulk/API), Cost (to us), Charge (billed to user), and User (claimer email/Unclaimed) across ALL scored profiles, and store the average cost-to-score in a new `app_stats` table for a future API endpoint.

**Architecture:** A new `app_stats` key-value table holds `avg_cost_cents`, recomputed + upserted after every score write (`runEval`/`reEvaluate`, best-effort). A pure DB helper `listScoredProfiles()` classifies each `source='url'` evaluation as web/bulk/api (request_ip set → web; linked to a `scoring_job_items` row → bulk; else api), sums its `credit_ledger` `score_debit` charge, and resolves its claimer clerk id. The page resolves claimer emails via one batched Clerk `getUserList` call.

**Tech Stack:** Next.js 16 App Router (server components), Drizzle ORM (neon-http), Clerk backend (`clerkClient`), Vitest (tests run against the shared dev Neon DB).

**Design source:** the approved design in this conversation (no separate spec doc — user green-lit code directly). Key decisions: one row per profile (no per-run history); claimer **email** via Clerk batch; `app_stats.avg_cost_cents` refreshed on each score; drop IP/Location columns.

---

## File structure

- **Modify** `src/db/schema.ts` — add `appStats` table (+ `doublePrecision` import).
- **Create** `drizzle/0013_*.sql` (+ snapshot) — generated migration.
- **Create** `src/lib/app-stats.ts` — `AVG_COST_CENTS_KEY`, `refreshAvgCostStat()`, `getAvgCostCents()`.
- **Modify** `src/lib/eval-pipeline.ts` — best-effort `refreshAvgCostStat()` after the eval write in `runEval` + `reEvaluate`.
- **Create** `src/lib/profiles-scored.ts` — `listScoredProfiles(limit)` (pure DB: source/cost/charge/claimer-clerk-id).
- **Rewrite** `src/app/(authed)/admin/profiles/page.tsx` — new columns + Clerk email batch + avg-cost header.
- **Tests:** `tests/lib/app-stats.test.ts`, `tests/lib/profiles-scored.test.ts`.

Tests run against the live dev Neon DB (see `tests/app/rescore-all.test.ts`); seed rows with random ids and clean up.

---

### Task 1: `app_stats` table + migration 0013 + push to dev DB

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0013_*.sql` (+ `drizzle/meta/0013_snapshot.json`) — generated
- Modify: `PRD/events-v1.md`

- [ ] **Step 1: Add the `doublePrecision` import**

In `src/db/schema.ts`, the top import from `"drizzle-orm/pg-core"` lists `pgTable, uuid, text, integer, timestamp, jsonb, date, boolean, primaryKey, index, uniqueIndex, type AnyPgColumn`. Add `doublePrecision` to that import list.

- [ ] **Step 2: Add the table**

Append to `src/db/schema.ts` (after the last table):

```ts
// Small key-value store for computed/cached app metrics, read by admin pages and
// the developer API. Currently holds: "avg_cost_cents" = mean cost-to-score
// across all real (source="url") profiles with a recorded cost, refreshed after
// every score write. `value` is a double so fractional cents (e.g. 40.27) survive.
export const appStats = pgTable("app_stats", {
  key: text("key").primaryKey(),
  value: doublePrecision("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0013_*.sql` containing `CREATE TABLE "app_stats"` (+ snapshot). Must NOT print "No schema changes".

- [ ] **Step 4: Apply to the dev Neon DB**

`pnpm db:push` cannot run headlessly in this repo (drizzle-kit's table resolver needs a TTY — see migration 0009 notes in `PRD/events-v1.md`). Instead apply the generated SQL directly:

Run: `pnpm tsx --require dotenv/config -e "import('./src/db/index.ts').then(async({db})=>{const{sql}=await import('drizzle-orm');await db.execute(sql\`CREATE TABLE IF NOT EXISTS app_stats (key text PRIMARY KEY, value double precision NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())\`);const r=await db.execute(sql\`select to_regclass('public.app_stats') as t\`);console.log(JSON.stringify(r.rows ?? r));process.exit(0)})"`
Expected: output shows a non-null `app_stats`. (`.env.local` provides `DATABASE_URL`.)

- [ ] **Step 5: PRD entry + commit**

Prepend a new `PRD/events-v1.md` entry (newest first, per `CLAUDE.md`) noting the `app_stats` table (migration 0013), then:
```bash
git add src/db/schema.ts drizzle/ PRD/events-v1.md
git commit -m "feat(stats): app_stats key-value table (avg_cost_cents) — migration 0013"
```
Expected: drift guard runs `drizzle-kit generate`, prints "No schema changes", commit succeeds. Do NOT use `--no-verify`.

---

### Task 2: `app-stats.ts` lib (refresh + read) — TDD

**Files:**
- Create: `src/lib/app-stats.ts`
- Test: `tests/lib/app-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/app-stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { evaluations, appStats } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  AVG_COST_CENTS_KEY,
  refreshAvgCostStat,
  getAvgCostCents,
} from "@/lib/app-stats";

describe("app-stats avg cost", () => {
  it("refreshAvgCostStat stores the mean cost over source=url evals with a cost", async () => {
    const value = await refreshAvgCostStat();

    // It must match a direct AVG query over the same population.
    const [direct] = await db
      .select({ avg: sql<number | null>`avg(${evaluations.costTotalCents})` })
      .from(evaluations)
      .where(and(eq(evaluations.source, "url"), isNotNull(evaluations.costTotalCents)));
    const expected = Number(direct?.avg ?? 0);

    expect(value).toBeCloseTo(expected, 5);

    // It is persisted under the documented key, readable by getAvgCostCents.
    const [stored] = await db
      .select({ value: appStats.value })
      .from(appStats)
      .where(eq(appStats.key, AVG_COST_CENTS_KEY));
    expect(stored).toBeTruthy();
    expect(Number(stored.value)).toBeCloseTo(expected, 5);
    expect(await getAvgCostCents()).toBeCloseTo(expected, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/app-stats.test.ts`
Expected: FAIL — `@/lib/app-stats` not found.

- [ ] **Step 3: Implement the lib**

Create `src/lib/app-stats.ts`:

```ts
import { db } from "@/db";
import { appStats, evaluations } from "@/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";

// Stored in app_stats under this key (value is a double = mean cost in cents).
export const AVG_COST_CENTS_KEY = "avg_cost_cents";

// Recompute the mean cost-to-score across all real (source="url") profiles that
// have a recorded cost, and upsert it into app_stats. Returns the value.
// Callers in the scoring path wrap this in .catch() so a stats hiccup never
// fails a score.
export async function refreshAvgCostStat(): Promise<number> {
  const [row] = await db
    .select({ avg: sql<number | null>`avg(${evaluations.costTotalCents})` })
    .from(evaluations)
    .where(and(eq(evaluations.source, "url"), isNotNull(evaluations.costTotalCents)));
  const value = Number(row?.avg ?? 0);
  await db
    .insert(appStats)
    .values({ key: AVG_COST_CENTS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appStats.key,
      set: { value, updatedAt: new Date() },
    });
  return value;
}

// Read the stored average cost in cents (e.g. 40.27), or null if never computed.
export async function getAvgCostCents(): Promise<number | null> {
  const [row] = await db
    .select({ value: appStats.value })
    .from(appStats)
    .where(eq(appStats.key, AVG_COST_CENTS_KEY))
    .limit(1);
  return row ? Number(row.value) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/app-stats.test.ts`
Expected: PASS (1 test). (Re-run once if a Neon cold-start timeout appears.)

- [ ] **Step 5: PRD + commit**

```bash
git add src/lib/app-stats.ts tests/lib/app-stats.test.ts PRD/events-v1.md
git commit -m "feat(stats): refreshAvgCostStat + getAvgCostCents helpers"
```
(Prepend a one-line PRD entry first so the hook passes; no schema.ts change so no drift guard.)

---

### Task 3: refresh avg cost after every score write

**Files:**
- Modify: `src/lib/eval-pipeline.ts`

No new automated test — the refresh logic itself is covered by Task 2; running a full `runEval` requires live LLM/Exa calls. tsc + the Task 9 manual smoke verify the wiring.

- [ ] **Step 1: Import the helper**

In `src/lib/eval-pipeline.ts`, add near the existing imports (it already imports from `@/db` and `@/db/schema`):

```ts
import { refreshAvgCostStat } from "@/lib/app-stats";
```

- [ ] **Step 2: Call it after the insert in `runEval`**

In `runEval`, the function currently ends:

```ts
  await assignSlugIfMissing({
    evalId: row!.id,
    fullName: row!.fullName,
    linkedinUrl,
    founderScore: row!.founderScore,
    investorScore: row!.investorScore,
  });
  return rowToResult(row!);
}
```

Insert the refresh just before `return rowToResult(row!);` (best-effort — a stats failure must not fail the score):

```ts
  // Keep the stored average cost current (best-effort; never fail a score on it).
  await refreshAvgCostStat().catch(() => {});
  return rowToResult(row!);
```

- [ ] **Step 3: Call it after the update in `reEvaluate`**

`reEvaluate` ends with the same `assignSlugIfMissing(...)` + `return rowToResult(row!);`. Insert the same line before its `return rowToResult(row!);`:

```ts
  // Keep the stored average cost current (best-effort; never fail a score on it).
  await refreshAvgCostStat().catch(() => {});
  return rowToResult(row!);
```

(There are two `return rowToResult(row!);` lines now carrying the refresh — one in each function. Make sure you add it inside BOTH `runEval` and `reEvaluate`, not anywhere else.)

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 5: PRD + commit**

```bash
git add src/lib/eval-pipeline.ts PRD/events-v1.md
git commit -m "feat(stats): refresh avg cost after each score (runEval + reEvaluate)"
```

---

### Task 4: `listScoredProfiles` DB helper (source/cost/charge/claimer) — TDD

**Files:**
- Create: `src/lib/profiles-scored.ts`
- Test: `tests/lib/profiles-scored.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/profiles-scored.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import {
  evaluations,
  scoringJobs,
  scoringJobItems,
  creditLedger,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { listScoredProfiles } from "@/lib/profiles-scored";

// Track everything we insert so afterEach can remove it in FK-safe order.
const evalIds: string[] = [];
const jobIds: string[] = [];
const clerkIds: string[] = [];

afterEach(async () => {
  // users → evaluations (cascades scoring_job_items) → scoring_jobs → ledger
  for (const id of clerkIds.splice(0)) {
    await db.delete(users).where(eq(users.clerkUserId, id));
  }
  for (const id of evalIds.splice(0)) {
    await db.delete(creditLedger).where(eq(creditLedger.evaluationId, id));
    await db.delete(evaluations).where(eq(evaluations.id, id));
  }
  for (const id of jobIds.splice(0)) {
    await db.delete(scoringJobs).where(eq(scoringJobs.id, id));
  }
});

async function seedEval(opts: {
  requestIp?: string | null;
  costTotalCents?: number | null;
}): Promise<string> {
  const [row] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: `https://www.linkedin.com/in/test-${crypto.randomUUID()}`,
      score: 50,
      signalQuality: "high",
      source: "url",
      requestIp: opts.requestIp ?? null,
      costTotalCents: opts.costTotalCents ?? 40,
    })
    .returning();
  evalIds.push(row.id);
  return row.id;
}

describe("listScoredProfiles", () => {
  it("classifies web/bulk/api and resolves charge + claimer", async () => {
    // web: request_ip set
    const webId = await seedEval({ requestIp: "203.0.113.7", costTotalCents: 41 });
    // bulk: no request_ip, linked to a scoring_job_items row
    const bulkId = await seedEval({ requestIp: null, costTotalCents: 40 });
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 1 })
      .returning();
    jobIds.push(job.id);
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "test",
      evaluationId: bulkId,
      status: "done",
    });
    // api: no request_ip, no job item, but a credit_ledger score_debit charge
    const apiId = await seedEval({ requestIp: null, costTotalCents: 39 });
    const apiClerkId = `u_api_${crypto.randomUUID()}`;
    clerkIds.push(apiClerkId);
    await db.insert(creditLedger).values({
      clerkUserId: apiClerkId,
      deltaCents: -390, // charged $3.90
      reason: "score_debit",
      evaluationId: apiId,
      balanceAfterCents: 0,
    });
    // Claim the web profile (high confidence) by a clerk user.
    const claimerClerkId = `u_claim_${crypto.randomUUID()}`;
    clerkIds.push(claimerClerkId);
    await db.insert(users).values({
      clerkUserId: claimerClerkId,
      evaluationId: webId,
      matchConfidence: "high",
    });

    const rows = await listScoredProfiles(500);
    const byId = new Map(rows.map((r) => [r.id, r]));

    expect(byId.get(webId)?.source).toBe("web");
    expect(byId.get(bulkId)?.source).toBe("bulk");
    expect(byId.get(apiId)?.source).toBe("api");

    expect(byId.get(webId)?.costCents).toBe(41);
    expect(byId.get(webId)?.chargeCents).toBe(0); // web never billed
    expect(byId.get(apiId)?.chargeCents).toBe(390); // API charge surfaced

    expect(byId.get(webId)?.claimerClerkUserId).toBe(claimerClerkId);
    expect(byId.get(bulkId)?.claimerClerkUserId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: FAIL — `@/lib/profiles-scored` not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/profiles-scored.ts`:

```ts
import { db } from "@/db";
import { evaluations, scoringJobItems, creditLedger, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export type ScoredProfileSource = "web" | "bulk" | "api";

export type ScoredProfileRow = {
  id: string;
  fullName: string | null;
  source: ScoredProfileSource;
  costCents: number | null; // cost to us; null on pre-instrumentation rows
  chargeCents: number; // billed to the user; 0 for web/bulk (never charged)
  claimerClerkUserId: string | null; // null when unclaimed
  updatedAt: Date;
};

// One row per real (source="url") profile, newest first, capped at `limit`.
// Source classification: request_ip set → web (a person scored it on the site);
// else if it's linked to a scoring_job_items row → bulk (cron job); else → api.
// (request_ip wins if both, reflecting the most-recent web touch.)
export async function listScoredProfiles(limit = 200): Promise<ScoredProfileRow[]> {
  const evals = await db
    .select({
      id: evaluations.id,
      fullName: evaluations.fullName,
      requestIp: evaluations.requestIp,
      costTotalCents: evaluations.costTotalCents,
      updatedAt: evaluations.updatedAt,
    })
    .from(evaluations)
    .where(eq(evaluations.source, "url"))
    .orderBy(desc(evaluations.updatedAt))
    .limit(limit);

  const ids = evals.map((e) => e.id);
  if (ids.length === 0) return [];

  // Bulk: evaluation ids that appear as a scoring_job_items.evaluation_id.
  const jobItemRows = await db
    .select({ evaluationId: scoringJobItems.evaluationId })
    .from(scoringJobItems)
    .where(inArray(scoringJobItems.evaluationId, ids));
  const bulkSet = new Set(
    jobItemRows.map((r) => r.evaluationId).filter((x): x is string => !!x),
  );

  // Charge: sum of score_debit amounts per evaluation (delta is negative).
  const debits = await db
    .select({ evaluationId: creditLedger.evaluationId, delta: creditLedger.deltaCents })
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, "score_debit"), inArray(creditLedger.evaluationId, ids)));
  const chargeMap = new Map<string, number>();
  for (const d of debits) {
    if (!d.evaluationId) continue;
    chargeMap.set(d.evaluationId, (chargeMap.get(d.evaluationId) ?? 0) + -d.delta);
  }

  // Claim: evaluation id → claimer clerk id (high/medium confidence only,
  // matching the rest of the app's "claimed" definition).
  const claims = await db
    .select({
      evaluationId: users.evaluationId,
      clerkUserId: users.clerkUserId,
      matchConfidence: users.matchConfidence,
    })
    .from(users)
    .where(inArray(users.evaluationId, ids));
  const claimMap = new Map<string, string>();
  for (const c of claims) {
    if (c.evaluationId && (c.matchConfidence === "high" || c.matchConfidence === "medium")) {
      claimMap.set(c.evaluationId, c.clerkUserId);
    }
  }

  return evals.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    source: e.requestIp != null ? "web" : bulkSet.has(e.id) ? "bulk" : "api",
    costCents: e.costTotalCents,
    chargeCents: chargeMap.get(e.id) ?? 0,
    claimerClerkUserId: claimMap.get(e.id) ?? null,
    updatedAt: e.updatedAt,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: PASS (1 test). (Re-run once on a Neon cold-start timeout.)

- [ ] **Step 5: PRD + commit**

```bash
git add src/lib/profiles-scored.ts tests/lib/profiles-scored.test.ts PRD/events-v1.md
git commit -m "feat(admin): listScoredProfiles (source/cost/charge/claimer) helper"
```

---

### Task 5: rewrite `/admin/profiles` page (new columns + email batch + avg header)

**Files:**
- Rewrite: `src/app/(authed)/admin/profiles/page.tsx`

No automated test (server/Clerk UI, consistent with the codebase); verified in Task 6 manual smoke.

- [ ] **Step 1: Replace the page**

Replace the entire contents of `src/app/(authed)/admin/profiles/page.tsx` with:

```tsx
import { clerkClient } from "@clerk/nextjs/server";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import {
  listScoredProfiles,
  type ScoredProfileRow,
  type ScoredProfileSource,
} from "@/lib/profiles-scored";
import { refreshAvgCostStat, getAvgCostCents } from "@/lib/app-stats";

export const dynamic = "force-dynamic";

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

const SOURCE_STYLE: Record<ScoredProfileSource, string> = {
  web: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  bulk: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  api: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

function SourcePill({ source }: { source: ScoredProfileSource }) {
  const label = source === "web" ? "Web" : source === "bulk" ? "Bulk" : "API";
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs ${SOURCE_STYLE[source]}`}>
      {label}
    </span>
  );
}

// Resolve claimer clerk ids → emails in ONE batched Clerk Backend API call
// (avoids N+1). Returns a map; ids that fail to resolve are simply absent.
async function resolveEmails(clerkUserIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (clerkUserIds.length === 0) return out;
  try {
    const clerk = await clerkClient();
    const res = await clerk.users.getUserList({
      userId: clerkUserIds,
      limit: clerkUserIds.length,
    });
    for (const u of res.data) {
      const email =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        null;
      if (email) out.set(u.id, email);
    }
  } catch {
    // Leave unresolved; the UI falls back to "claimed".
  }
  return out;
}

export default async function AdminProfilesPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  // Score Detail exposes raw scoring grounding — super-admin (drodio) only.
  const superAdmin = await isSuperAdmin();

  const profiles: ScoredProfileRow[] = await listScoredProfiles(200);

  // Average cost: refresh on load (so it reflects existing data + stays current
  // for the developer API to read from app_stats), then read the value.
  let avgCostCents: number | null = null;
  try {
    avgCostCents = await refreshAvgCostStat();
  } catch {
    avgCostCents = await getAvgCostCents().catch(() => null);
  }

  const claimerIds = [
    ...new Set(
      profiles
        .map((p) => p.claimerClerkUserId)
        .filter((x): x is string => !!x),
    ),
  ];
  const emailById = await resolveEmails(claimerIds);

  const totalCost = profiles.reduce((a, p) => a + (p.costCents ?? 0), 0);
  const totalCharge = profiles.reduce((a, p) => a + p.chargeCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Profiles scored</h1>
        <p className="text-sm text-zinc-500 mt-1 tabular-nums">
          {profiles.length} profiles · avg cost {fmtCents(avgCostCents)} · total cost{" "}
          {fmtCents(totalCost)} · total charged {fmtCents(totalCharge)}
        </p>
        <p className="text-xs text-zinc-600 mt-1 max-w-2xl">
          Every scored profile, by source. Cost is what it cost us; Charge is what
          we billed the user ($0 unless scored via the paid API). Avg cost is across
          all scored profiles.
        </p>
      </div>

      {profiles.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No profiles scored yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.15em] text-zinc-500 border-b border-zinc-800">
                <th className="py-2 pr-4 font-normal">Profile</th>
                <th className="py-2 pr-4 font-normal">Source</th>
                <th className="py-2 pr-4 font-normal text-right">Cost</th>
                <th className="py-2 pr-4 font-normal text-right">Charge</th>
                <th className="py-2 pr-4 font-normal">User</th>
                <th className="py-2 pr-4 font-normal">When</th>
                {superAdmin && <th className="py-2 pr-4 font-normal text-right">Detail</th>}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const email = p.claimerClerkUserId
                  ? emailById.get(p.claimerClerkUserId) ?? "claimed"
                  : null;
                return (
                  <tr key={p.id} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                    <td className="py-2 pr-4">
                      <a
                        href={`/profile?e=${p.id}`}
                        className="link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {p.fullName?.trim() || "(unnamed)"}
                      </a>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <SourcePill source={p.source} />
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtCents(p.costCents)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtCents(p.chargeCents)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {email ? (
                        <span className="text-zinc-300">{email}</span>
                      ) : (
                        <span className="text-zinc-500">Unclaimed</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap tabular-nums">
                      {fmtDate(p.updatedAt)}
                    </td>
                    {superAdmin && (
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        <a
                          href={`/profile?e=${p.id}&debug=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link text-xs"
                        >
                          Score Detail ↗
                        </a>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: clean. (If `clerk.users.getUserList`'s return type differs, confirm the result shape is `{ data: User[] }` in this Clerk version — the account-delete route at `src/app/api/account/delete/route.ts` uses `clerkClient()` the same way; `getUserList` returns a paginated `{ data, totalCount }`.)

- [ ] **Step 3: Confirm the route serves**

With the dev server on :3002, run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/profiles`
Expected: `200` (renders the gate for the unauth curl, or the page for an authed browser — both 200; not 404/500). Also `grep -i "error" /tmp/events-3002.log | tail` shows no new compile error.

- [ ] **Step 4: PRD + commit**

```bash
git add "src/app/(authed)/admin/profiles/page.tsx" PRD/events-v1.md
git commit -m "feat(admin): Profiles scored table — Source/Cost/Charge/User + avg cost header"
```

---

### Task 6: full verification + manual smoke + PRD + prod note

**Files:**
- Modify: `PRD/events-v1.md`

- [ ] **Step 1: tsc + the new tests**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/lib/app-stats.test.ts tests/lib/profiles-scored.test.ts`
Expected: tsc clean; both test files pass. (Re-run a failing file once for Neon cold-start flakiness.)

- [ ] **Step 2: Manual smoke on :3002 (as an admin in the browser)**

Visit `/admin/profiles` and confirm:
1. Columns: Profile · Source · Cost · Charge · User · When · (Detail for super-admin). No IP/Location.
2. Source badges show Web / Bulk / API; rows from bulk jobs and (any) API scores now appear (not just web).
3. Cost shows `$x.xx` (or "—" for old rows); Charge shows `$0.00` for web/bulk and the billed amount for API rows.
4. User shows the claimer's email for claimed profiles, "Unclaimed" otherwise.
5. Header shows "avg cost $x.xx".

- [ ] **Step 3: PRD entry — record WHERE the average lives (for the user's future endpoint)**

Prepend a `PRD/events-v1.md` entry stating: the average cost is stored in **`app_stats`**, row **`key='avg_cost_cents'`**, column **`value`** (double, cents — e.g. 40.27), refreshed after every score write and on each `/admin/profiles` load; read it via `getAvgCostCents()` in `src/lib/app-stats.ts`. Also note: **prod migration 0013 (`app_stats`) must be applied to the prod Neon Primary before ship** (no auto-migrate; operator runs it; additive + safe).

- [ ] **Step 4: Commit**

```bash
git add PRD/events-v1.md
git commit -m "docs(stats): Profiles-scored + avg cost (app_stats.avg_cost_cents) — verification + prod note"
```

---

## Self-review notes

- **Spec coverage:** Source column (Task 4 classification + Task 5 pill) ✓; Cost (Task 5, `costTotalCents`) ✓; Charge $0/web vs billed/API (Task 4 `credit_ledger` sum + Task 5) ✓; User = claimer email/Unclaimed (Task 4 claimer id + Task 5 Clerk batch) ✓; every run/all sources = one row per `source='url'` profile, IP/Location dropped (Task 5) ✓; average cost stored in DB + told where (Task 1 `app_stats`, Task 2 helpers, Task 3 refresh-on-score, Task 6 PRD note) ✓; accessible to a future API (Task 2 `getAvgCostCents` + documented `app_stats.avg_cost_cents`) ✓.
- **Type consistency:** `ScoredProfileRow`/`ScoredProfileSource` defined in Task 4 and consumed in Task 5; `chargeCents` is always a number (0 default); `costCents`/`claimerClerkUserId` nullable. `refreshAvgCostStat(): Promise<number>` + `getAvgCostCents(): Promise<number|null>` consistent across Tasks 2/3/5. `AVG_COST_CENTS_KEY` constant single-sourced.
- **No placeholders:** every code/test step is complete; commands have expected output.
- **Charge semantics:** sums all `score_debit` for an eval (a profile re-scored via API multiple times shows total billed) — intentional.
```
