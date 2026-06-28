# Profiles ↔ Run Consolidation (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/profiles` show the bulk runs each profile belongs to (pills), let an operator filter the list by source + run labels, and add a persistent single-run view at `/admin/profiles/<jobId>` with a per-item Status column — so the `/admin/score/<jobId>` job-detail view becomes redundant (Phase A: view only; `/admin/score` stays).

**Architecture:** Reads-only, no DB migration. `scoring_job_items.evaluation_id → scoring_jobs.id` already links a profile to a bulk run (the run's `title` lives on `scoring_jobs`). We (1) extend `listScoredProfiles` so each row carries `runs: {jobId,title}[]`, refactoring its per-profile enrichment into a shared `enrichEvals()` helper; (2) add `listProfilesForJob(jobId)` reusing that helper and attaching each item's `status`; (3) extract a pure `profile-filter.ts` for label→visible logic; (4) render run pills + a Filter control + an optional Status column in `ProfilesScoredTable`; (5) add the `[jobId]` route. `/admin/score` and its live progress/auto-driver/spend controls are untouched (Phase B).

**Tech Stack:** Next.js 16 App Router (server + client components, `force-dynamic`, dynamic `[jobId]` route with `params: Promise<…>`), Drizzle ORM (neon-http; `innerJoin`; `db.execute(sql\`…\`)` window query), Vitest, Tailwind, react-icons, Clerk (`adminGate` + `can("view_profiles")`).

**Spec:** `docs/superpowers/specs/2026-05-26-profiles-run-consolidation-design.md`

---

## File Structure

- **Modify** `src/lib/profiles-scored.ts` — add `runs[]` + optional `status` to `ScoredProfileRow`; refactor enrichment into `enrichEvals()`; add `listProfilesForJob()` + `JobProfiles` type; add shared `EVAL_BASE_COLUMNS` select. (Tasks 1, 2)
- **Modify** `tests/lib/profiles-scored.test.ts` — assert `runs[]`; add `listProfilesForJob` tests. (Tasks 1, 2)
- **Create** `src/lib/profile-filter.ts` — pure label/filter helpers (no React). (Task 3)
- **Create** `tests/lib/profile-filter.test.ts` — unit tests for the pure helpers. (Task 3)
- **Modify** `src/components/admin/ProfilesScoredTable.tsx` — `runs[]` + optional `status` on the row type; run pills in Source; Filter control; optional Status column via `showStatus` prop; CSV reflects filtered+sorted view. (Task 4)
- **Modify** `src/app/(authed)/admin/profiles/page.tsx` — pass `runs` through into the serialized rows. (Task 4)
- **Create** `src/app/(authed)/admin/profiles/[jobId]/page.tsx` — gated single-run view (header + back link + unresolved-count note + table with `showStatus`). (Task 5)
- **Modify** `PRD/events-v1.md` — prepend a progress entry (required by the pre-commit hook every commit). (each task's commit)

---

## Important conventions (read before starting)

- **Pre-commit hook BLOCKS the commit** unless `PRD/events-v1.md` is staged with a NEW dated entry. Prepend an entry (newest at top) to `PRD/events-v1.md` and `git add` it as part of EVERY commit in this plan. Never use `--no-verify`.
- If `src/db/schema.ts` is ever staged, the hook also runs a drizzle drift guard. This plan does NOT touch schema.ts — do not modify it.
- Run the test suite with `pnpm vitest run <path>` (or `pnpm test` for all). Tests hit the **dev** Neon branch (`ep-old-shadow`) and clean up after themselves; the existing `profiles-scored.test.ts` shows the FK-safe teardown pattern — follow it.
- Type-check with `pnpm tsc --noEmit`. Lint with `pnpm lint`. Both must pass before each commit.
- This branch (`events-v1`) is a worktree; deps are already installed. If `pnpm vitest` complains about a missing binary, run `pnpm install` once.

---

### Task 1: `listScoredProfiles` carries `runs[]` (refactor enrichment into `enrichEvals`)

**Files:**
- Modify: `src/lib/profiles-scored.ts`
- Test: `tests/lib/profiles-scored.test.ts`

- [ ] **Step 1: Add the failing assertion to the existing test**

In `tests/lib/profiles-scored.test.ts`, inside the existing `it("classifies web/bulk/api …")` test, give the bulk job a title and assert `runs[]`. Change the job insert and add assertions.

Replace this block:

```ts
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 1 })
      .returning();
```

with:

```ts
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 1, title: "7 YC Founders" })
      .returning();
```

Then, just before the closing `});` of that `it(...)` block (after the existing `claimerClerkUserId` assertions), add:

```ts
    // runs[]: the bulk profile lists its one run (with title); web/api list none.
    expect(byId.get(bulkId)?.runs).toEqual([{ jobId: job.id, title: "7 YC Founders" }]);
    expect(byId.get(webId)?.runs).toEqual([]);
    expect(byId.get(apiId)?.runs).toEqual([]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: FAIL — `runs` is `undefined` (property does not exist on the returned row yet).

- [ ] **Step 3: Add `runs` (+ optional `status`) to the `ScoredProfileRow` type**

In `src/lib/profiles-scored.ts`, find the `ScoredProfileRow` type. After the `profileHref: string;` line (the last field, before the closing `};`), add:

```ts
  // Every bulk run this profile belongs to (re-scores → multiple). [] for web/api.
  runs: { jobId: string; title: string | null }[];
  // Per-run item status; only set by listProfilesForJob (the single-run view).
  status?: string;
```

- [ ] **Step 4: Add a shared `EVAL_BASE_COLUMNS` select + refactor enrichment into `enrichEvals`**

In `src/lib/profiles-scored.ts`, replace the entire `listScoredProfiles` function (from `export async function listScoredProfiles(limit = 200)` through its closing `}`) with the shared columns const, the slimmed `listScoredProfiles`, and the new `enrichEvals` helper:

```ts
// Base evaluation columns shared by listScoredProfiles + listProfilesForJob so
// the two read identical rows and can't drift. Matches EvalBaseRow below.
const EVAL_BASE_COLUMNS = {
  id: evaluations.id,
  fullName: evaluations.fullName,
  linkedinUrl: evaluations.linkedinUrl,
  requestIp: evaluations.requestIp,
  requestCity: evaluations.requestCity,
  requestRegion: evaluations.requestRegion,
  requestCountry: evaluations.requestCountry,
  costTotalCents: evaluations.costTotalCents,
  updatedAt: evaluations.updatedAt,
  founderScore: evaluations.founderScore,
  investorScore: evaluations.investorScore,
  combinedScore: evaluations.score,
  slug: evaluations.slug,
  slugKind: evaluations.slugKind,
  profile: evaluations.profile,
} as const;

type EvalBaseRow = {
  id: string;
  fullName: string | null;
  linkedinUrl: string;
  requestIp: string | null;
  requestCity: string | null;
  requestRegion: string | null;
  requestCountry: string | null;
  costTotalCents: number | null;
  updatedAt: Date;
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  slug: string | null;
  slugKind: string | null;
  profile: unknown;
};

// One row per real (source="url") profile, newest first, capped at `limit`.
export async function listScoredProfiles(limit = 200): Promise<ScoredProfileRow[]> {
  const evals = await db
    .select(EVAL_BASE_COLUMNS)
    .from(evaluations)
    .where(eq(evaluations.source, "url"))
    .orderBy(desc(evaluations.updatedAt))
    .limit(limit);
  return enrichEvals(evals);
}

// Shared enrichment: given base evaluation rows, attach derived source, charge,
// claimer, leaderboard rank, badges, company, canonical href, and the bulk runs
// each profile belongs to. Used by listScoredProfiles (full list) and
// listProfilesForJob (one run). Sub-queries are scoped to the passed ids except
// the leaderboard rank, which is a global window mapped onto these ids.
async function enrichEvals(evals: EvalBaseRow[]): Promise<ScoredProfileRow[]> {
  const ids = evals.map((e) => e.id);
  if (ids.length === 0) return [];

  // Bulk runs: each (eval → scoring_job) link with the run title. Replaces the
  // old bulkSet; an eval can be in several runs (re-scores) → de-dup by jobId.
  const runRows = await db
    .select({
      evaluationId: scoringJobItems.evaluationId,
      jobId: scoringJobItems.jobId,
      title: scoringJobs.title,
    })
    .from(scoringJobItems)
    .innerJoin(scoringJobs, eq(scoringJobItems.jobId, scoringJobs.id))
    .where(inArray(scoringJobItems.evaluationId, ids));
  const runsByEval = new Map<string, { jobId: string; title: string | null }[]>();
  for (const r of runRows) {
    if (!r.evaluationId) continue;
    const list = runsByEval.get(r.evaluationId) ?? [];
    if (!list.some((x) => x.jobId === r.jobId)) list.push({ jobId: r.jobId, title: r.title });
    runsByEval.set(r.evaluationId, list);
  }

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
      clerkUsername: users.clerkUsername,
      matchConfidence: users.matchConfidence,
    })
    .from(users)
    .where(inArray(users.evaluationId, ids));
  const claimMap = new Map<string, string>();
  const usernameMap = new Map<string, string>(); // eval id → claimer's clerk username
  for (const c of claims) {
    if (c.evaluationId && (c.matchConfidence === "high" || c.matchConfidence === "medium")) {
      claimMap.set(c.evaluationId, c.clerkUserId);
      if (c.clerkUsername && !usernameMap.has(c.evaluationId)) {
        usernameMap.set(c.evaluationId, c.clerkUsername);
      }
    }
  }

  // Leaderboard rank: position by combined score among the rankable population
  // (non-low-signal, non-code). Computed once, mapped to the displayed rows.
  const rankResult = await db.execute(sql`
    SELECT id::text AS id, rank() OVER (ORDER BY score DESC) AS rnk
    FROM evaluations
    WHERE signal_quality != 'low' AND source != 'code'
  `);
  const rankRows =
    (rankResult as unknown as { rows?: Array<{ id: string; rnk: number }> }).rows ??
    (rankResult as unknown as Array<{ id: string; rnk: number }>);
  const rankMap = new Map<string, number>();
  for (const r of rankRows ?? []) rankMap.set(r.id, Number(r.rnk));

  // Badge overrides for the displayed rows, grouped by eval (matches leaderboard).
  const overridesByEval = new Map<
    string,
    Array<{ badgeId: string; status: BadgeStatus; editedLabel: string | null }>
  >();
  const overrideRows = await db
    .select({
      evaluationId: badgeOverrides.evaluationId,
      badgeId: badgeOverrides.badgeId,
      status: badgeOverrides.status,
      editedLabel: badgeOverrides.editedLabel,
    })
    .from(badgeOverrides)
    .where(inArray(badgeOverrides.evaluationId, ids));
  for (const r of overrideRows) {
    if (!overridesByEval.has(r.evaluationId)) overridesByEval.set(r.evaluationId, []);
    overridesByEval
      .get(r.evaluationId)!
      .push({ badgeId: r.badgeId, status: r.status as BadgeStatus, editedLabel: r.editedLabel });
  }

  return evals.map((e) => {
    const chargeCents = chargeMap.get(e.id) ?? 0;
    const p = (e.profile as ProfileBlob | null) ?? null;
    const firmName = p?.extractedMetrics?.partnerAtFirm?.trim() || null;
    const companyName = firmName || companyNameFromDomain(p?.primaryCompanyDomain);
    const rawDomain = (p?.primaryCompanyDomain ?? "").trim().toLowerCase();
    const companyUrl = rawDomain ? `https://${rawDomain.replace(/^https?:\/\//, "")}` : null;
    const runs = runsByEval.get(e.id) ?? [];
    const badges = computeBadges(
      {
        isClaimed: claimMap.has(e.id),
        extractedMetrics: p?.extractedMetrics ?? null,
        mmHits: p?.mmHits ?? null,
        primaryCompanyDomain: p?.primaryCompanyDomain ?? null,
      },
      overridesByEval.get(e.id) ?? [],
    );
    return {
      id: e.id,
      fullName: e.fullName,
      linkedinUrl: e.linkedinUrl,
      source: classifyProfileSource({ chargeCents, isBulk: runs.length > 0 }),
      costCents: e.costTotalCents,
      chargeCents,
      claimerClerkUserId: claimMap.get(e.id) ?? null,
      updatedAt: e.updatedAt,
      requestIp: e.requestIp,
      requestCity: e.requestCity,
      requestRegion: e.requestRegion,
      requestCountry: e.requestCountry,
      founderScore: e.founderScore,
      investorScore: e.investorScore,
      combinedScore: e.combinedScore,
      leaderboardRank: rankMap.get(e.id) ?? null,
      badges: badges.filter((b) => b.status !== "rejected").map((b) => b.label),
      companyName,
      companyUrl,
      profileHref: profileUrlFor({
        evalId: e.id,
        clerkUsername: usernameMap.get(e.id) ?? null,
        slug: e.slug,
        slugKind: e.slugKind,
      }),
      runs,
    };
  });
}
```

Note: `scoringJobs` must be imported. The import on line 2 currently is `import { evaluations, scoringJobItems, creditLedger, users, badgeOverrides } from "@/db/schema";` — add `scoringJobs`:

```ts
import { evaluations, scoringJobs, scoringJobItems, creditLedger, users, badgeOverrides } from "@/db/schema";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: PASS (all assertions, including the new `runs[]` ones).

- [ ] **Step 6: Type-check + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors. (`selectStaleProfiles` still compiles — it keeps its own local `bulkSet` query and is untouched.)

- [ ] **Step 7: Commit**

Prepend a dated entry to `PRD/events-v1.md` (newest at top) summarizing "Phase A task 1: listScoredProfiles now returns runs[]; enrichment refactored into shared enrichEvals()". Then:

```bash
git add src/lib/profiles-scored.ts tests/lib/profiles-scored.test.ts PRD/events-v1.md
git commit -m "feat(profiles): listScoredProfiles returns bulk runs[]; shared enrichEvals"
```

---

### Task 2: `listProfilesForJob(jobId)` — one run's profiles + status

**Files:**
- Modify: `src/lib/profiles-scored.ts`
- Test: `tests/lib/profiles-scored.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/profiles-scored.test.ts`, update the import on line 11 to also import the new helper:

```ts
import { listScoredProfiles, listProfilesForJob } from "@/lib/profiles-scored";
```

Add this new test after the existing `it(...)` block (still inside the `describe("listScoredProfiles", …)` block, or in a new `describe` — either is fine):

```ts
  it("listProfilesForJob returns the run's scored profiles + status + unresolved count", async () => {
    const scoredId = await seedEval({ requestIp: null, costTotalCents: 40 });
    const [job] = await db
      .insert(scoringJobs)
      .values({ model: "sonnet", totalItems: 2, title: "Batch A" })
      .returning();
    jobIds.push(job.id);
    // One item is scored (linked to an eval, status done)...
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "scored person",
      evaluationId: scoredId,
      status: "done",
    });
    // ...the other is still pending (no evaluation linked yet).
    await db.insert(scoringJobItems).values({
      jobId: job.id,
      inputRaw: "pending person",
      status: "pending",
    });

    const result = await listProfilesForJob(job.id);

    expect(result.job).toEqual({ id: job.id, title: "Batch A" });
    expect(result.unresolvedCount).toBe(1); // the pending item has no eval
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(scoredId);
    expect(result.rows[0].status).toBe("done");
    // Enrichment still applied: the scored row knows it belongs to this run.
    expect(result.rows[0].runs).toEqual([{ jobId: job.id, title: "Batch A" }]);
  });

  it("listProfilesForJob returns job:null for an unknown jobId", async () => {
    const result = await listProfilesForJob(crypto.randomUUID());
    expect(result.job).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.unresolvedCount).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: FAIL — `listProfilesForJob` is not exported / not a function.

- [ ] **Step 3: Implement `listProfilesForJob` + `JobProfiles`**

In `src/lib/profiles-scored.ts`, add the new export immediately after `enrichEvals` (before `selectStaleProfiles`):

```ts
export type JobProfiles = {
  job: { id: string; title: string | null } | null; // null when the job doesn't exist
  rows: ScoredProfileRow[]; // one row per linked (scored) eval, each with .status
  unresolvedCount: number; // items in this run with no evaluation yet (not shown)
};

// The scored profiles in ONE bulk run (for /admin/profiles/<jobId>). Reuses the
// shared enrichEvals() so the rows match the main list exactly, then attaches
// each profile's per-item status. Phase A shows only items that resolved to an
// evaluation; unresolvedCount reports how many are still pending/unscored.
export async function listProfilesForJob(jobId: string): Promise<JobProfiles> {
  const [job] = await db
    .select({ id: scoringJobs.id, title: scoringJobs.title })
    .from(scoringJobs)
    .where(eq(scoringJobs.id, jobId))
    .limit(1);
  if (!job) return { job: null, rows: [], unresolvedCount: 0 };

  // Newest item first so that, if an eval was scored more than once in this job,
  // we keep its most recent item's status.
  const items = await db
    .select({ evaluationId: scoringJobItems.evaluationId, status: scoringJobItems.status })
    .from(scoringJobItems)
    .where(eq(scoringJobItems.jobId, jobId))
    .orderBy(desc(scoringJobItems.createdAt));

  const unresolvedCount = items.filter((it) => !it.evaluationId).length;
  const statusByEval = new Map<string, string>();
  for (const it of items) {
    if (it.evaluationId && !statusByEval.has(it.evaluationId)) {
      statusByEval.set(it.evaluationId, it.status);
    }
  }
  const evalIds = [...statusByEval.keys()];
  if (evalIds.length === 0) return { job, rows: [], unresolvedCount };

  const evals = await db
    .select(EVAL_BASE_COLUMNS)
    .from(evaluations)
    .where(inArray(evaluations.id, evalIds))
    .orderBy(desc(evaluations.updatedAt));

  const enriched = await enrichEvals(evals);
  const rows = enriched.map((r) => ({ ...r, status: statusByEval.get(r.id) }));
  return { job, rows, unresolvedCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/profiles-scored.test.ts`
Expected: PASS (all four assertions in the two new tests + the existing test).

- [ ] **Step 5: Type-check + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

Prepend a `PRD/events-v1.md` entry ("Phase A task 2: listProfilesForJob() — one run's scored profiles + status + unresolved count"). Then:

```bash
git add src/lib/profiles-scored.ts tests/lib/profiles-scored.test.ts PRD/events-v1.md
git commit -m "feat(profiles): add listProfilesForJob(jobId) single-run reader"
```

---

### Task 3: Pure label/filter helpers (`profile-filter.ts`)

**Files:**
- Create: `src/lib/profile-filter.ts`
- Test: `tests/lib/profile-filter.test.ts`

The filter is "a profile is visible iff ANY of its labels is enabled." Labels are a row's source label (Web/Bulk/API) plus one per bulk run it's in. Keep this logic pure (no React) so it's unit-testable and the client component just wires state to it.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/profile-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  collectFilterLabels,
  rowLabelKeys,
  rowMatchesFilter,
  type FilterableRow,
} from "@/lib/profile-filter";

const webRow: FilterableRow = { source: "web", runs: [] };
const bulkRow: FilterableRow = {
  source: "bulk",
  runs: [{ jobId: "job-1", title: "Batch A" }],
};
const multiRunRow: FilterableRow = {
  source: "bulk",
  runs: [
    { jobId: "job-1", title: "Batch A" },
    { jobId: "job-2", title: "Batch B" },
  ],
};

describe("rowLabelKeys", () => {
  it("includes the source key plus one run key per run", () => {
    expect(rowLabelKeys(webRow)).toEqual(["source:web"]);
    expect(rowLabelKeys(bulkRow)).toEqual(["source:bulk", "run:job-1"]);
    expect(rowLabelKeys(multiRunRow)).toEqual(["source:bulk", "run:job-1", "run:job-2"]);
  });
});

describe("collectFilterLabels", () => {
  it("returns source labels (web/bulk/api order) then de-duped run labels", () => {
    const labels = collectFilterLabels([webRow, bulkRow, multiRunRow]);
    expect(labels).toEqual([
      { key: "source:web", label: "Web", kind: "source" },
      { key: "source:bulk", label: "Bulk", kind: "source" },
      { key: "run:job-1", label: "Batch A", kind: "run" },
      { key: "run:job-2", label: "Batch B", kind: "run" },
    ]);
  });

  it("labels an untitled run 'Untitled run'", () => {
    const labels = collectFilterLabels([{ source: "bulk", runs: [{ jobId: "j", title: null }] }]);
    expect(labels).toContainEqual({ key: "run:j", label: "Untitled run", kind: "run" });
  });
});

describe("rowMatchesFilter", () => {
  it("shows a row when ANY of its labels is enabled", () => {
    expect(rowMatchesFilter(bulkRow, new Set(["run:job-1"]))).toBe(true); // run enabled
    expect(rowMatchesFilter(bulkRow, new Set(["source:bulk"]))).toBe(true); // source enabled
    expect(rowMatchesFilter(bulkRow, new Set(["source:web"]))).toBe(false); // neither matches
    expect(rowMatchesFilter(bulkRow, new Set<string>())).toBe(false); // select-none hides all
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/profile-filter.test.ts`
Expected: FAIL — `@/lib/profile-filter` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/profile-filter.ts`:

```ts
// Pure helpers for the /admin/profiles "Filter" control. A profile is visible
// iff ANY of its labels is enabled. A label is either a source (Web/Bulk/API)
// or a bulk run (keyed by jobId). No React here so it's unit-testable; the
// client component just holds the enabled-key Set and calls rowMatchesFilter.

export type ProfileSource = "web" | "bulk" | "api";

export type FilterableRow = {
  source: ProfileSource;
  runs: { jobId: string; title: string | null }[];
};

export type FilterLabel = {
  key: string; // "source:web" | "run:<jobId>"
  label: string; // display text
  kind: "source" | "run";
};

const SOURCE_LABEL: Record<ProfileSource, string> = { web: "Web", bulk: "Bulk", api: "API" };
const SOURCE_ORDER: ProfileSource[] = ["web", "bulk", "api"];

// The label keys a single row carries: its source + one per run it belongs to.
export function rowLabelKeys(row: FilterableRow): string[] {
  return [`source:${row.source}`, ...row.runs.map((r) => `run:${r.jobId}`)];
}

// Every distinct label across the rows: present source labels (web/bulk/api
// order) first, then run labels (first title seen per jobId wins), de-duped.
export function collectFilterLabels(rows: FilterableRow[]): FilterLabel[] {
  const presentSources = new Set(rows.map((r) => r.source));
  const labels: FilterLabel[] = SOURCE_ORDER.filter((s) => presentSources.has(s)).map((s) => ({
    key: `source:${s}`,
    label: SOURCE_LABEL[s],
    kind: "source" as const,
  }));
  const seenRuns = new Set<string>();
  for (const row of rows) {
    for (const run of row.runs) {
      if (seenRuns.has(run.jobId)) continue;
      seenRuns.add(run.jobId);
      labels.push({ key: `run:${run.jobId}`, label: run.title?.trim() || "Untitled run", kind: "run" });
    }
  }
  return labels;
}

// Visible iff ANY of the row's labels is in the enabled set.
export function rowMatchesFilter(row: FilterableRow, enabled: Set<string>): boolean {
  return rowLabelKeys(row).some((k) => enabled.has(k));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/profile-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

Prepend a `PRD/events-v1.md` entry ("Phase A task 3: pure profile-filter helpers (label → visible)"). Then:

```bash
git add src/lib/profile-filter.ts tests/lib/profile-filter.test.ts PRD/events-v1.md
git commit -m "feat(profiles): pure label/filter helpers for the profiles table"
```

---

### Task 4: `ProfilesScoredTable` — run pills, Filter control, optional Status column

**Files:**
- Modify: `src/components/admin/ProfilesScoredTable.tsx`
- Modify: `src/app/(authed)/admin/profiles/page.tsx`

This is the largest task — all edits are to one component plus one line in its server-page consumer. Apply each edit block exactly. (Manual smoke only; the pure logic is already covered by Task 3.)

- [ ] **Step 1: Extend `ProfileTableRow` + add `runs`/`status`; import the filter helpers**

In `src/components/admin/ProfilesScoredTable.tsx`, change the top imports (lines 1-5). Replace:

```ts
"use client";

import { Fragment, useMemo, useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import { LocalTime } from "@/components/LocalTime";
```

with:

```ts
"use client";

import { Fragment, useMemo, useState } from "react";
import { FaLinkedin } from "react-icons/fa";
import { LocalTime } from "@/components/LocalTime";
import { collectFilterLabels, rowMatchesFilter } from "@/lib/profile-filter";
```

Then in the `ProfileTableRow` type, after the `requestLocation: string | null; // pre-joined "City, CA, US" or null` line (before the closing `};`), add:

```ts
  runs: { jobId: string; title: string | null }[]; // bulk runs this profile is in
  status?: string; // per-run item status; only set by the single-run view
```

- [ ] **Step 2: Render run pills in the Source cell**

In `src/components/admin/ProfilesScoredTable.tsx`, replace the Source `<td>` (the block that currently renders just the one source pill):

```tsx
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded border text-xs ${SOURCE_STYLE[p.source]}`}>
                        {p.source === "web" ? "Web" : p.source === "bulk" ? "Bulk" : "API"}
                      </span>
                    </td>
```

with (source pill + one link pill per run):

```tsx
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`px-2 py-0.5 rounded border text-xs ${SOURCE_STYLE[p.source]}`}>
                          {p.source === "web" ? "Web" : p.source === "bulk" ? "Bulk" : "API"}
                        </span>
                        {p.runs.map((run) => (
                          <a
                            key={run.jobId}
                            href={`/admin/profiles/${run.jobId}`}
                            className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white text-xs whitespace-nowrap"
                          >
                            {run.title?.trim() || "Untitled run"}
                          </a>
                        ))}
                      </div>
                    </td>
```

- [ ] **Step 3: Add `showStatus` prop, filter state, and the filtered+sorted rows**

In `src/components/admin/ProfilesScoredTable.tsx`, replace the component signature + the `sorted`/`onSort`/`thProps`/`colCount` setup. Replace this block:

```tsx
export function ProfilesScoredTable({
  rows,
  superAdmin,
}: {
  rows: ProfileTableRow[];
  superAdmin: boolean;
}) {
  // Default: newest scored first; badges hidden until toggled on.
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showBadges, setShowBadges] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compare(sortValue(a, sortKey), sortValue(b, sortKey), dir));
    return copy;
  }, [rows, sortKey, dir]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc"); // every new column starts descending
    }
  }

  const thProps = { sortKey, dir, onSort };
  // Columns spanned by the full-width badges sub-row.
  const colCount = superAdmin ? 13 : 12;

  function exportCsv() {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
```

with:

```tsx
export function ProfilesScoredTable({
  rows,
  superAdmin,
  showStatus = false,
}: {
  rows: ProfileTableRow[];
  superAdmin: boolean;
  showStatus?: boolean; // single-run view shows the per-item Status column
}) {
  // Default: newest scored first; badges hidden until toggled on.
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showBadges, setShowBadges] = useState(false);

  // Filter: every label present in the rows; all enabled by default. A row is
  // visible iff ANY of its labels is enabled (see lib/profile-filter).
  const filterLabels = useMemo(() => collectFilterLabels(rows), [rows]);
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(filterLabels.map((l) => l.key)),
  );
  const [showFilter, setShowFilter] = useState(false);

  const sorted = useMemo(() => {
    const copy = rows.filter((r) => rowMatchesFilter(r, enabled));
    copy.sort((a, b) => compare(sortValue(a, sortKey), sortValue(b, sortKey), dir));
    return copy;
  }, [rows, sortKey, dir, enabled]);

  function onSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc"); // every new column starts descending
    }
  }

  function toggleLabel(key: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const thProps = { sortKey, dir, onSort };
  // Columns spanned by the full-width badges sub-row (Status adds one).
  const colCount = (superAdmin ? 13 : 12) + (showStatus ? 1 : 0);

  function exportCsv() {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
```

Note: when `rows` changes (new server data), `enabled` keeps its initializer value from first render. That is acceptable here — the table is server-rendered fresh per navigation (`force-dynamic`), so each page load re-mounts with all labels enabled. New labels appearing after mount within the same mount are rare; not handled in Phase A (documented in spec "Out of scope").

- [ ] **Step 4: Add the Filter control to the top toolbar**

In `src/components/admin/ProfilesScoredTable.tsx`, the toolbar is the `<div className="flex justify-end items-center gap-4">` block containing Export CSV + the Badges toggle. Insert a Filter control as the FIRST child of that toolbar (before the Export CSV button). Replace:

```tsx
      {/* Controls, top-right: badges toggle + CSV export of the current view. */}
      <div className="flex justify-end items-center gap-4">
        <button
          type="button"
          onClick={exportCsv}
          className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs"
        >
          Export CSV
        </button>
```

with:

```tsx
      {/* Controls, top-right: filter + badges toggle + CSV export of the view. */}
      <div className="flex justify-end items-center gap-4 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs"
          >
            Filter{enabled.size < filterLabels.length ? ` (${enabled.size}/${filterLabels.length})` : ""}
          </button>
          {showFilter && (
            <div className="absolute right-0 top-full mt-1 z-10 w-56 rounded border border-zinc-700 bg-[#1b1b1b] p-3 shadow-xl">
              <div className="flex justify-between mb-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEnabled(new Set(filterLabels.map((l) => l.key)))}
                  className="text-zinc-400 hover:text-white"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setEnabled(new Set())}
                  className="text-zinc-400 hover:text-white"
                >
                  Select none
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {filterLabels.map((l) => (
                  <label key={l.key} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled.has(l.key)}
                      onChange={() => toggleLabel(l.key)}
                      className="accent-[#dfa43a]"
                    />
                    <span className={l.kind === "source" ? "uppercase tracking-wide text-zinc-400" : ""}>
                      {l.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 py-1 text-xs"
        >
          Export CSV
        </button>
```

- [ ] **Step 5: Add the optional Status column (header + cell)**

In `src/components/admin/ProfilesScoredTable.tsx`, add the Status header. Find this header line:

```tsx
              <SortableTh k="when" label="Date Scored" {...thProps} />
```

and insert a Status `<th>` immediately BEFORE it:

```tsx
              {showStatus && <th className="py-2 pr-4 font-normal text-left">Status</th>}
              <SortableTh k="when" label="Date Scored" {...thProps} />
```

Then add the Status cell in the body. Find the Date-Scored `<td>` (the `LocalTime` cell):

```tsx
                    <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap tabular-nums">
                      <LocalTime iso={p.updatedAtIso} />
                    </td>
```

and insert a Status `<td>` immediately BEFORE it:

```tsx
                    {showStatus && (
                      <td className="py-2 pr-4 whitespace-nowrap text-xs">
                        <span className={STATUS_STYLE[p.status ?? ""] ?? "text-zinc-400"}>
                          {p.status ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap tabular-nums">
                      <LocalTime iso={p.updatedAtIso} />
                    </td>
```

Add the `STATUS_STYLE` map at module scope, right after the existing `SOURCE_STYLE` constant (after its closing `};`):

```tsx
// Per-item status colors for the single-run view's Status column.
const STATUS_STYLE: Record<string, string> = {
  done: "text-emerald-400",
  scoring: "text-amber-400",
  resolving: "text-amber-400",
  resolved: "text-amber-400",
  pending: "text-zinc-500",
  skipped: "text-zinc-500",
  failed: "text-red-400",
};
```

- [ ] **Step 6: Pass `runs` through in the server page**

In `src/app/(authed)/admin/profiles/page.tsx`, the `rows` mapping builds `ProfileTableRow[]`. Add `runs` to the mapped object. Find:

```tsx
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
  }));
```

and replace with:

```tsx
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
    runs: p.runs,
  }));
```

- [ ] **Step 7: Type-check + lint + build**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors. (Watch for `react-hooks/static-components` — `SortableTh` is module-level; the new Filter control uses inline JSX with no nested component definitions, so it's fine.)

- [ ] **Step 8: Manual smoke**

Start/confirm the dev server on :3002 (`pnpm dev -p 3002` if not already running). Visit `http://localhost:3002/admin/profiles` and confirm:
- Bulk rows show `[Bulk]` + one pill per run title; pills link to `/admin/profiles/<jobId>`.
- The Filter button opens a popover with source + run checkboxes, Select all / Select none; unchecking a label hides matching rows; the count badge updates.
- Export CSV downloads the currently filtered+sorted rows.
- Sorting, badges toggle, LinkedIn icon, zebra striping all still work.

- [ ] **Step 9: Commit**

Prepend a `PRD/events-v1.md` entry ("Phase A task 4: run pills + Filter control + optional Status column in ProfilesScoredTable; page passes runs"). Then:

```bash
git add src/components/admin/ProfilesScoredTable.tsx "src/app/(authed)/admin/profiles/page.tsx" PRD/events-v1.md
git commit -m "feat(profiles): run pills, label filter, and optional status column"
```

---

### Task 5: Single-run route `/admin/profiles/[jobId]`

**Files:**
- Create: `src/app/(authed)/admin/profiles/[jobId]/page.tsx`

Mirror the gating + email-resolution + serialization of the main `profiles/page.tsx`, but source rows from `listProfilesForJob`, validate the `jobId`, render a header with the run title + back link + unresolved-count note, and pass `showStatus`.

- [ ] **Step 1: Create the route page**

Create `src/app/(authed)/admin/profiles/[jobId]/page.tsx`:

```tsx
import { clerkClient } from "@clerk/nextjs/server";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { can } from "@/lib/grants";
import { isUuid } from "@/lib/canonicalize";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listProfilesForJob, type ScoredProfileRow } from "@/lib/profiles-scored";
import { ProfilesScoredTable, type ProfileTableRow } from "@/components/admin/ProfilesScoredTable";

export const dynamic = "force-dynamic";

// "San Mateo, CA, US" from the requester geo; null when nothing was captured.
function fmtLocation(p: ScoredProfileRow): string | null {
  const parts = [p.requestCity, p.requestRegion, p.requestCountry].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Resolve claimer clerk ids → emails in ONE batched Clerk call (avoids N+1).
async function resolveEmails(clerkUserIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (clerkUserIds.length === 0) return out;
  try {
    const clerk = await clerkClient();
    const res = await clerk.users.getUserList({ userId: clerkUserIds, limit: clerkUserIds.length });
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

export default async function AdminRunProfilesPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("view_profiles"))) return <NotAuthorized email={null} />;
  const superAdmin = await isSuperAdmin();

  const { jobId } = await params;
  if (!isUuid(jobId)) return <NotAuthorized email={null} />;

  const { job, rows: profiles, unresolvedCount } = await listProfilesForJob(jobId);
  if (!job) return <NotAuthorized email={null} />;

  const claimerIds = [
    ...new Set(profiles.map((p) => p.claimerClerkUserId).filter((x): x is string => !!x)),
  ];
  const emailById = await resolveEmails(claimerIds);

  const rows: ProfileTableRow[] = profiles.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    linkedinUrl: p.linkedinUrl,
    profileHref: p.profileHref,
    source: p.source,
    founderScore: p.founderScore,
    investorScore: p.investorScore,
    combinedScore: p.combinedScore,
    leaderboardRank: p.leaderboardRank,
    badges: p.badges,
    companyName: p.companyName,
    companyUrl: p.companyUrl,
    costCents: p.costCents,
    chargeCents: p.chargeCents,
    userEmail: p.claimerClerkUserId ? (emailById.get(p.claimerClerkUserId) ?? "claimed") : null,
    updatedAtIso: p.updatedAt.toISOString(),
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
    runs: p.runs,
    status: p.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href="/admin/profiles" className="link text-sm">
          ← All profiles
        </a>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
          {job.title?.trim() || "Untitled run"}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 tabular-nums">
          {profiles.length} scored
          {unresolvedCount > 0 ? ` · ${unresolvedCount} not yet scored` : ""}
        </p>
      </div>

      {profiles.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">
          No scored profiles in this run yet
          {unresolvedCount > 0 ? ` (${unresolvedCount} pending).` : "."}
        </p>
      ) : (
        <ProfilesScoredTable rows={rows} superAdmin={superAdmin} showStatus />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke**

On :3002, from `/admin/profiles` click a run pill. Confirm `/admin/profiles/<jobId>` shows: the back link, the run title header, the "N scored · M not yet scored" line, and the table WITH a Status column (per-item statuses). Visit `/admin/profiles/not-a-uuid` → NotAuthorized. Visit `/admin/profiles/<random-uuid>` → NotAuthorized (job not found).

- [ ] **Step 4: Commit**

Prepend a `PRD/events-v1.md` entry ("Phase A task 5: /admin/profiles/[jobId] single-run view (gated, status column, unresolved count)"). Then:

```bash
git add "src/app/(authed)/admin/profiles/[jobId]/page.tsx" PRD/events-v1.md
git commit -m "feat(profiles): persistent single-run view at /admin/profiles/[jobId]"
```

---

### Task 6: Full verification, PRD wrap-up, and ship

**Files:**
- Modify: `PRD/events-v1.md`

- [ ] **Step 1: Full test + type + lint sweep**

Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint`
Expected: all tests pass; no type or lint errors. If any pre-existing unrelated test is flaky/failing, note it but do not let it block — confirm the new `profiles-scored` and `profile-filter` tests pass specifically.

- [ ] **Step 2: Production build smoke**

Run: `pnpm build`
Expected: build succeeds (the new dynamic route compiles). If the build reveals a route-typing issue with `params`, confirm the `params: Promise<{ jobId: string }>` shape matches the App Router convention used by the sibling `score/[id]/page.tsx`.

- [ ] **Step 3: Final PRD entry + commit (if build required any fix)**

If Step 2 required a code change, prepend a `PRD/events-v1.md` entry and commit it with the fix. Otherwise skip.

- [ ] **Step 4: Pull main, rebase/merge, push, PR, merge to prod**

Per repo convention (prod deploys via PR merge to `main`):

```bash
git fetch origin
git merge origin/main           # resolve any migration-journal collisions by taking main canonical
pnpm install                    # in case main changed deps (also satisfies the drift guard)
pnpm tsc --noEmit && pnpm vitest run   # re-verify after the merge
git push origin events-v1
gh pr create --base main --head events-v1 --title "Consolidate bulk-run view into /admin/profiles (Phase A)" --body "<summary + test plan>"
```

Wait for the Vercel preview build to go green (that's the build gate), then merge the PR. No DB migration is required for this feature (reads only). After merge, smoke-test on production (`festival.so`): `/admin/profiles` shows run pills + Filter; a run pill opens `/admin/profiles/<jobId>` with the Status column.

---

## Self-Review notes (author)

- **Spec coverage:** runs[] on ScoredProfileRow (T1) ✓; single query joining scoring_jobs, de-dup by jobId (T1) ✓; label model + ANY-enabled rule (T3) ✓; Filter control with all/none, client-side (T4) ✓; run pills linking to `/admin/profiles/<jobId>` (T4) ✓; new dynamic route gated + isUuid + header + back link (T5) ✓; Status column only in single-run view via `showStatus` (T4 header/cell + T5 passes it) ✓; listProfilesForJob with status + unresolvedCount, "only items with a linked evaluation" (T2) ✓; ScoredProfileRow reused with optional status (T1/T2) ✓; CSV reflects filtered+sorted (T4 uses `sorted`, which is now filtered) ✓; tests for runs[] (T1), listProfilesForJob (T2), pure filter logic (T3) ✓; no migration ✓; `/admin/score` untouched ✓.
- **Type consistency:** `ScoredProfileRow.runs: {jobId:string; title:string|null}[]` and `.status?: string` defined in T1; `ProfileTableRow` mirrors both in T4; `FilterableRow`/`FilterLabel` in T3 match the `runs`/`source` shape; `JobProfiles` in T2 returns `{job, rows, unresolvedCount}` consumed verbatim in T5. `collectFilterLabels`/`rowMatchesFilter` names match between T3 and T4.
- **Placeholder scan:** the only `<…>` placeholders are the PR title/body and PRD entry prose, which are intentionally author-supplied at ship time.
