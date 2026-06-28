# Re-score all profiles ("Re-Run All") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Re-Run All" control to the admin jobs table that re-scores every profile in bulk by creating one scoring job whose items are all existing AI-scored profiles.

**Architecture:** A "re-score all" is just a scoring job populated with one item per `source="url"` evaluation, each item carrying its `evaluationId`. The existing cron worker (`/api/cron/scoring-tick`) already calls `reEvaluate(evaluationId, { model })` for items that have an `evaluationId`, so the bulk run reuses the exact per-profile scoring pipeline — no duplication. A new admin-gated endpoint populates the job; a client button (model picker + confirm) triggers it; both reuse existing job UI, progress, and cost tracking.

**Tech Stack:** Next.js 16 App Router (route handlers + server components), Drizzle ORM (neon-http), Clerk auth, Vitest (node env, real test Postgres), Tailwind.

Spec: `docs/superpowers/specs/2026-05-26-rescore-all-design.md`

---

## File Structure

- **Create** `src/app/api/admin/rescore-all/route.ts` — admin-gated POST that creates the bulk job + items. One responsibility: turn "all profiles" into a queued scoring job.
- **Create** `tests/app/rescore-all.test.ts` — integration tests for the endpoint (auth, validation, job/item creation).
- **Create** `src/components/admin/RescoreAllButton.tsx` — client control (model `<select>` + "Re-Run All" button + confirm + redirect). Mirrors `RerunButton.tsx`.
- **Modify** `src/app/(authed)/admin/page.tsx` — fetch the eligible-profile count + per-model estimate; always render the jobs table; render `<RescoreAllButton>` in the table's trailing header cell.

Reference (read-only, do not change): `src/app/api/admin/jobs/route.ts` (job-create pattern), `src/components/admin/RerunButton.tsx` (button pattern), `src/db/schema.ts` (`scoringJobs`, `scoringJobItems`).

---

## Task 1: `POST /api/admin/rescore-all` endpoint

**Files:**
- Test: `tests/app/rescore-all.test.ts`
- Create: `src/app/api/admin/rescore-all/route.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/rescore-all.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

// Admin state is toggled per-test. estimateJobCents is mocked to a fixed
// per-item rate so assertions don't depend on the DB-tuned median. isScoringModel
// is kept real (importActual) so model validation behaves like production.
let mockIsAdmin = true;
vi.mock("@/lib/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin")>();
  return {
    ...actual,
    isAdmin: vi.fn(async () => mockIsAdmin),
    estimateJobCents: vi.fn(async (n: number) => n * 13),
  };
});

// currentUser is fully mocked (don't load the real Clerk module in node env).
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => ({
    emailAddresses: [{ emailAddress: "admin@test.dev" }],
  })),
}));

import { POST } from "@/app/api/admin/rescore-all/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/rescore-all", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockIsAdmin = true;
});

describe("POST /api/admin/rescore-all", () => {
  it("creates a queued job with one resolved item per source=url profile", async () => {
    const expected = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(eq(evaluations.source, "url"));
    expect(expected.length).toBeGreaterThan(0); // suite-shared DB always has url evals

    const res = await post({ model: "sonnet" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobId).toBeTruthy();
    expect(json.count).toBe(expected.length);

    const [job] = await db
      .select()
      .from(scoringJobs)
      .where(eq(scoringJobs.id, json.jobId));
    expect(job.status).toBe("queued");
    expect(job.model).toBe("sonnet");
    expect(job.totalItems).toBe(expected.length);

    const items = await db
      .select()
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, json.jobId));
    expect(items.length).toBe(expected.length);
    expect(items.every((it) => it.status === "resolved")).toBe(true);
    expect(items.every((it) => it.evaluationId != null)).toBe(true);

    // Cleanup: deleting the job cascades to its items (FK onDelete: cascade).
    await db.delete(scoringJobs).where(eq(scoringJobs.id, json.jobId));
  });

  it("returns 403 when not an admin (and creates no job)", async () => {
    mockIsAdmin = false;
    const before = (await db.select({ id: scoringJobs.id }).from(scoringJobs)).length;
    const res = await post({ model: "sonnet" });
    expect(res.status).toBe(403);
    const after = (await db.select({ id: scoringJobs.id }).from(scoringJobs)).length;
    expect(after).toBe(before);
  });

  it("returns 400 on an invalid model", async () => {
    const res = await post({ model: "gpt-5" });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/rescore-all.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/admin/rescore-all/route"` (the route doesn't exist yet).

- [ ] **Step 3: Write the endpoint**

Create `src/app/api/admin/rescore-all/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { isAdmin, isScoringModel, estimateJobCents } from "@/lib/admin";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { model?: string };

// Re-score every AI-scored profile in one batch. This does NOT score inline
// (that would blow the function time limit) — it creates a queued scoring job
// with one item per profile. The cron worker (prod) / job-page auto-driver
// (localhost) then calls reEvaluate per item, so the bulk run uses the exact
// current per-profile scoring pipeline. SECURITY: admin-gated server-side —
// isAdmin() counts only verified emails, so this is the real gate (the UI
// button is just convenience).
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const model = (body.model ?? "sonnet").toLowerCase();
  if (!isScoringModel(model)) {
    return NextResponse.json({ error: "invalid model" }, { status: 400 });
  }

  // All AI-scored profiles. source="code" rows are manually-entered scores with
  // no real LinkedIn research behind them — re-scoring would clobber them.
  const profiles = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
    })
    .from(evaluations)
    .where(eq(evaluations.source, "url"));

  if (profiles.length === 0) {
    return NextResponse.json({ jobId: null, count: 0 });
  }

  const user = await currentUser();
  const createdByEmail =
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const [job] = await db
    .insert(scoringJobs)
    .values({
      title: `Re-score all profiles — ${today}`,
      model,
      status: "queued",
      totalItems: profiles.length,
      estimatedCents: await estimateJobCents(profiles.length, model),
      createdByEmail,
    })
    .returning();

  // Each item carries evaluationId → the worker calls reEvaluate (fresh
  // in-place re-score) rather than runEval (URL cache hit). status "resolved"
  // skips handle-resolution and goes straight to scoring. inputRaw is NOT NULL
  // in the schema; linkedin_url is always present (NOT NULL on evaluations).
  const rows = profiles.map((p) => ({
    jobId: job!.id,
    inputRaw: p.fullName ?? p.linkedinUrl,
    linkedinUrl: p.linkedinUrl,
    evaluationId: p.id,
    status: "resolved" as const,
  }));

  // Chunk inserts so a large corpus stays well under the neon-http param cap.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(scoringJobItems).values(rows.slice(i, i + CHUNK));
  }

  return NextResponse.json({
    jobId: job!.id,
    count: profiles.length,
    estimatedCents: job!.estimatedCents,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/rescore-all.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (pre-existing `.next/types` `LayoutProps` noise in a fresh worktree is OK; ignore those).

- [ ] **Step 6: Commit**

```bash
git add tests/app/rescore-all.test.ts src/app/api/admin/rescore-all/route.ts
git commit -m "feat: POST /api/admin/rescore-all — bulk re-score job (admin-gated)"
```

---

## Task 2: `RescoreAllButton` client component

**Files:**
- Create: `src/components/admin/RescoreAllButton.tsx`

No unit test: the codebase runs Vitest in the `node` environment and does not unit-test interactive client components (e.g. `RerunButton.tsx` has none — it relies on `window.confirm`, `fetch`, and `useRouter`). Verify manually in Task 3's step. This is a deliberate convention match, not a skipped requirement.

- [ ] **Step 1: Write the component**

Create `src/components/admin/RescoreAllButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScoringModel } from "@/lib/admin";

// "Re-Run All" — re-scores every profile via one scoring job (each item
// re-scored in place by the worker via reEvaluate). Lives in the jobs-table
// header, above the per-row Re-run buttons. Confirms first since it spends real
// money. Cost preview uses the tuned per-profile estimate (cents) passed per
// model, so the dialog reflects the chosen model without a round-trip.
export function RescoreAllButton({
  count,
  centsPerProfile,
}: {
  count: number;
  centsPerProfile: Record<ScoringModel, number>;
}) {
  const router = useRouter();
  const [model, setModel] = useState<ScoringModel>("sonnet");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (count === 0) {
      alert("No profiles to re-score yet.");
      return;
    }
    const estUsd = `$${((count * centsPerProfile[model]) / 100).toFixed(2)}`;
    if (
      !window.confirm(
        `Re-score all ${count} profile${count === 1 ? "" : "s"} with ${model}? ` +
          `This re-scores every profile from scratch (fresh Exa + Claude) and ` +
          `spends real money — about ${estUsd}.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rescore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.jobId) {
        router.push(`/admin/jobs/${json.jobId}`);
      } else {
        alert(json.error || `Re-run all failed (HTTP ${res.status})`);
        setBusy(false);
      }
    } catch {
      alert("Re-run all failed: network error");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={model}
        onChange={(e) => setModel(e.target.value as ScoringModel)}
        disabled={busy}
        aria-label="Model for re-scoring all profiles"
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 normal-case"
      >
        <option value="sonnet">Sonnet</option>
        <option value="opus">Opus</option>
      </select>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 normal-case"
      >
        {busy ? "Starting…" : "Re-Run All"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (Confirms `ScoringModel` import and prop types are valid; the component isn't referenced yet, so this only checks the file in isolation.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RescoreAllButton.tsx
git commit -m "feat: RescoreAllButton — model picker + Re-Run All control"
```

---

## Task 3: Wire into the admin jobs table

**Files:**
- Modify: `src/app/(authed)/admin/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/(authed)/admin/page.tsx`, change the import block at the top. Replace:

```ts
import { db } from "@/db";
import { scoringJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getVercelCredits, type VercelCreditsResult } from "@/lib/spend/vercel-ai-gateway";
import { getRecordedSpend, type RecordedSpend } from "@/lib/spend/recorded";
import { RerunButton } from "@/components/admin/RerunButton";
import { adminGate } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
```

with:

```ts
import { db } from "@/db";
import { scoringJobs, evaluations } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { getVercelCredits, type VercelCreditsResult } from "@/lib/spend/vercel-ai-gateway";
import { getRecordedSpend, type RecordedSpend } from "@/lib/spend/recorded";
import { RerunButton } from "@/components/admin/RerunButton";
import { RescoreAllButton } from "@/components/admin/RescoreAllButton";
import { adminGate, getEstimateCents } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
```

- [ ] **Step 2: Fetch the profile count + per-model estimate**

Replace the data-fetch block:

```ts
  const [jobs, vercel, recorded] = await Promise.all([
    db.select().from(scoringJobs).orderBy(desc(scoringJobs.createdAt)).limit(50),
    getVercelCredits(),
    getRecordedSpend().catch(() => null),
  ]);
```

with:

```ts
  const [jobs, vercel, recorded, profileCountRows, sonnetCents, opusCents] =
    await Promise.all([
      db.select().from(scoringJobs).orderBy(desc(scoringJobs.createdAt)).limit(50),
      getVercelCredits(),
      getRecordedSpend().catch(() => null),
      // Count of AI-scored profiles eligible for bulk re-score (source="url").
      db
        .select({ n: count() })
        .from(evaluations)
        .where(eq(evaluations.source, "url")),
      getEstimateCents("sonnet"),
      getEstimateCents("opus"),
    ]);
  const profileCount = profileCountRows[0]?.n ?? 0;
```

- [ ] **Step 3: Always render the jobs table; put Re-Run All in the header**

Replace the entire jobs render block — from `{jobs.length === 0 ? (` through its closing `)}` (the empty-state ternary plus the `<div className="border ...">…</div>` table) — with this single always-rendered table. The empty-state moves into the `<tbody>` so the header (with Re-Run All) is always visible:

```tsx
      <div className="border border-zinc-800 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Model</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Progress</th>
              <th className="text-right px-4 py-3">Est / Actual</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-right px-4 py-3">
                <RescoreAllButton
                  count={profileCount}
                  centsPerProfile={{ sonnet: sonnetCents, opus: opusCents }}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr className="border-t border-zinc-800">
                <td colSpan={7} className="px-4 py-6 text-zinc-500 text-sm">
                  No jobs yet. Start one with{" "}
                  <Link href="/admin/jobs/new" className="link">+ New job</Link>.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <a href={`/admin/jobs/${j.id}`} className="text-white hover:text-zinc-300">
                      {j.title ?? <span className="text-zinc-500">untitled</span>}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{j.model}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.completedItems + j.failedItems} / {j.totalItems}
                    {j.failedItems > 0 && (
                      <span className="text-red-400 ml-2">({j.failedItems} failed)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
                    {fmtCents(j.estimatedCents)} / {fmtCents(j.actualCents)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{fmtDate(j.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {["completed", "failed", "cancelled"].includes(j.status) && (
                      <RerunButton jobId={j.id} totalItems={j.totalItems} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

Run: `pnpm vitest run`
Expected: all tests pass (the 3 new rescore-all tests + the existing suite).

- [ ] **Step 5: Manual verification (localhost)**

Dev server runs on port 3002 from this worktree. With the server up:

1. Sign in as an admin and open `http://localhost:3002/admin`.
2. Confirm a **Re-Run All** button + a Sonnet/Opus dropdown appear in the top-right header cell of the Scoring jobs table, above the per-row Re-run buttons.
3. Pick **Sonnet**, click **Re-Run All**. Confirm the dialog shows the profile count and a dollar estimate (e.g. "about $12.xx"). Cancel — verify nothing happens.
4. Click again and confirm. Verify you're redirected to `/admin/jobs/<id>`, the job title is "Re-score all profiles — <date>", `totalItems` equals the profile count, and (on localhost) the auto-driver begins processing items.
5. Open a profile whose item completed and confirm its score updated in place (reEvaluate ran), not a duplicate eval.
6. (Auth) In a private window signed in as a NON-admin, `curl -X POST http://localhost:3002/api/admin/rescore-all -H 'content-type: application/json' -d '{"model":"sonnet"}'` (with that session's cookie) returns 403 and creates no job.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(authed)/admin/page.tsx"
git commit -m "feat: wire Re-Run All into the admin jobs table header"
```

---

## Self-Review

**1. Spec coverage:**
- Endpoint `POST /api/admin/rescore-all`, admin-gated, `{model}` validated, source="url" scope, creates job + resolved items with evaluationId, tuned `estimateJobCents`, returns `{jobId}` / `{jobId:null,count:0}` → Task 1. ✓
- `RescoreAllButton` (model picker, confirm with tuned cost, redirect) → Task 2. ✓
- Placement in jobs table header (last column, above per-row Re-run) → Task 3. ✓
- Security: new endpoint gates via `isAdmin()`; existing `/jobs`, `/jobs/[id]`, `/rescore` already gated (audited in spec, no change needed). ✓
- Cost via tuned `getEstimateCents`/`estimateJobCents` → Tasks 1 & 3. ✓
- Out-of-scope items (subset selection, run-dedupe lock, code-sourced, scheduling) correctly omitted. ✓
- Spec's 0-eligible *integration* test is intentionally omitted (the suite-shared Postgres always contains url evals, so it can't be exercised without destructive setup); the behavior is implemented (`{jobId:null,count:0}`) and covered by code, with the client `count===0` guard surfacing it in the UI. Documented here so it's not mistaken for a gap.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; `<id>`/`<date>` are runtime values, not unfilled spec gaps. ✓

**3. Type consistency:** `ScoringModel` (from `@/lib/admin`) used consistently for `model` state and `centsPerProfile: Record<ScoringModel, number>`. Endpoint returns `{ jobId, count, estimatedCents }`; component reads `json.jobId`. `getEstimateCents(model)` returns per-profile cents (number); page passes `{sonnet, opus}` cents; component computes `count * centsPerProfile[model]`. `estimateJobCents(count, model)` used for the job's stored `estimatedCents`. Schema columns match the inserts (`inputRaw` NOT NULL satisfied by `fullName ?? linkedinUrl`; `status: "resolved"`; `evaluationId` set). ✓
