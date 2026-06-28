# Phase B — retire `/admin/score`, fold onto `/admin/profiles` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Delete `/admin/score`, `/admin/score/new`, `/admin/score/[id]` by relocating their machinery — jobs list, New Job, Re-Run All/Re-run, the live progress + localhost auto-driver, and the Spend cards — into the `/admin/profiles` area.

**Architecture:** UI relocation only; backend API routes (`/api/admin/jobs`, `/api/admin/jobs/[id]`, `/api/admin/rescore-all`, `/api/cron/scoring-tick`) are unchanged. `/admin/profiles/[jobId]` (server, rich profiles table from Phase A) gains a client `<JobLiveProgress>` island. `/admin/profiles` gains a collapsible `<RunsPanel>`. New-job form moves to `/admin/profiles/new`. Spend cards move to the Credits page (`/admin/spend`). No DB migration.

**Tech Stack:** Next.js 16 App Router, Drizzle (neon-http), Clerk, Vitest, Tailwind, react-icons.

**Spec:** `docs/superpowers/specs/2026-05-27-phase-b-score-consolidation-design.md`

---

## Conventions (read first)
- Pre-commit hook BLOCKS unless `PRD/events-v1.md` is staged with a NEW dated entry (newest on top, `## Progress Update as of <date> Pacific`). Never `--no-verify`. Prepend an entry per task commit.
- Do NOT touch `src/db/schema.ts` (no migration this phase).
- `pnpm` only. `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm vitest run <file>`. Pre-existing lint errors in unrelated files are acceptable; the files YOU touch must be clean.
- DB-touching tests can time out under full-suite parallelism — run targeted files (optionally `--no-file-parallelism`); a 5000ms timeout is infra, a fast assertion failure is real.

---

### Task 1: `activeNavHref` + nav repoint + most-specific highlight

**Files:** Modify `src/lib/admin-nav.ts`, `src/components/admin/AdminNav.tsx`, `tests/lib/admin-nav.test.ts`

- [ ] **Step 1: Failing tests** — in `tests/lib/admin-nav.test.ts`, update the import and the `run_scoring_jobs` expectation, and add `activeNavHref` tests.

Change the import line:
```ts
import { ADMIN_NAV, visibleNavItems, isActiveNav, activeNavHref } from "@/lib/admin-nav";
```
Replace the `run_scoring_jobs` assertion (currently expects `["/admin/spend","/admin/score"]`) with:
```ts
    // run_scoring_jobs gates Credits (spend) + Bulk Score (now the new-job page).
    expect(visibleNavItems(["run_scoring_jobs"]).map((i) => i.href)).toEqual([
      "/admin/spend",
      "/admin/profiles/new",
    ]);
```
Add a new describe block at the end of the file:
```ts
describe("activeNavHref", () => {
  const hrefs = ADMIN_NAV.map((i) => i.href);
  it("picks the most specific (longest) matching item", () => {
    // /admin/profiles/new must light up Bulk Score, not Scored Profiles by prefix.
    expect(activeNavHref("/admin/profiles/new", hrefs)).toBe("/admin/profiles/new");
    // a single-run view lights up Scored Profiles.
    expect(activeNavHref("/admin/profiles/abc-123", hrefs)).toBe("/admin/profiles");
    expect(activeNavHref("/admin/profiles", hrefs)).toBe("/admin/profiles");
  });
  it("returns null when nothing matches", () => {
    expect(activeNavHref("/admin", hrefs)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail** — `pnpm vitest run tests/lib/admin-nav.test.ts` → FAIL (`activeNavHref` not exported; run_scoring_jobs mismatch).

- [ ] **Step 3: Implement** — in `src/lib/admin-nav.ts`:

Repoint the Bulk Score entry (label unchanged) — replace the `/admin/score` line:
```ts
  { href: "/admin/profiles/new", label: "Bulk Score", section: "main", anyGrant: ["run_scoring_jobs"] },
```
(Leave the other entries as-is: Credits `/admin/spend`, Scored Profiles `/admin/profiles`, Manage Events, then the superadmin items.)

Add, after `isActiveNav`:
```ts
// The single nav item to highlight for `pathname`: the LONGEST `hrefs` entry that
// isActiveNav-matches it (so /admin/profiles/new highlights "Bulk Score", not
// "Scored Profiles" by prefix). null when nothing matches.
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (isActiveNav(pathname, href) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
```

- [ ] **Step 4: Use it in `AdminNav.tsx`** — replace the icon key `/admin/score` and switch highlighting to `activeNavHref`.

Imports — change the admin-nav import:
```ts
import { visibleNavItems, activeNavHref } from "@/lib/admin-nav";
```
Icon map — change the score key:
```ts
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/admin/spend": FaCoins,
  "/admin/profiles/new": FiBarChart2,
  "/admin/profiles": FiUser,
  "/admin/events": FiCalendar,
};
```
Replace the `cls` helper (which calls `isActiveNav`) so highlight uses the most-specific match. Inside the component, after `const items = visibleNavItems(grants);` add:
```ts
  const activeHref = activeNavHref(pathname, items.map((i) => i.href));
```
and change `cls`:
```ts
  const cls = (href: string) =>
    `py-1 transition-colors ${
      href === activeHref ? "text-white" : "text-[#dfa43a] hover:text-[#e6b860]"
    }`;
```
(Remove the now-unused `isActiveNav` import if present.)

- [ ] **Step 5: Run → pass** — `pnpm vitest run tests/lib/admin-nav.test.ts` → PASS. Then `pnpm tsc --noEmit && pnpm lint`.

- [ ] **Step 6: Commit** — prepend PRD entry ("Phase B task 1: nav Bulk Score → /admin/profiles/new, activeNavHref most-specific highlight"). 
```bash
git add src/lib/admin-nav.ts src/components/admin/AdminNav.tsx tests/lib/admin-nav.test.ts PRD/events-v1.md
git commit -m "feat(admin): repoint Bulk Score nav to new-job page + most-specific highlight"
```

---

### Task 2: New-job page at `/admin/profiles/new` + redirect retargets

**Files:** Create `src/app/(authed)/admin/profiles/new/page.tsx`; Modify `src/components/admin/NewJobForm.tsx`, `src/components/admin/StaleRescoreForm.tsx`

- [ ] **Step 1: Create the page** — `src/app/(authed)/admin/profiles/new/page.tsx` (mirror the old `/admin/score/new`, add a `run_scoring_jobs` gate):
```tsx
import { NewJobForm } from "@/components/admin/NewJobForm";
import { getEstimateCents, HANDLE_RESOLVE_CENTS, adminGate } from "@/lib/admin";
import { can, getViewerCostMultiplier } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { NotAuthorized } from "@/components/admin/NotAuthorized";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const gate = await adminGate();
  if (!gate.ok) return <NotAuthorized email={gate.email} />;
  if (!(await can("run_scoring_jobs"))) return <NotAuthorized email={null} />;
  const [sonnet, opus] = await Promise.all([
    getEstimateCents("sonnet"),
    getEstimateCents("opus"),
  ]);
  const costMult = await getViewerCostMultiplier();
  const show = (c: number) => applyCostMultiplier(c, costMult) ?? c;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Score Founders &amp; Investors</h1>
      <NewJobForm
        perEvalCents={{ sonnet: show(sonnet), opus: show(opus) }}
        resolveCents={show(HANDLE_RESOLVE_CENTS)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Retarget redirects** — in `src/components/admin/NewJobForm.tsx` line ~156 and `src/components/admin/StaleRescoreForm.tsx` line ~99, change:
```ts
      router.push(`/admin/score/${json.jobId}`);
```
to:
```ts
      router.push(`/admin/profiles/${json.jobId}`);
```
(one occurrence in each file).

- [ ] **Step 3: Verify** — `pnpm tsc --noEmit && pnpm lint && pnpm build`. Expected: build shows `ƒ /admin/profiles/new`; no errors in touched files.

- [ ] **Step 4: Commit** — PRD entry. 
```bash
git add "src/app/(authed)/admin/profiles/new/page.tsx" src/components/admin/NewJobForm.tsx src/components/admin/StaleRescoreForm.tsx PRD/events-v1.md
git commit -m "feat(admin): move New Bulk Scoring Job to /admin/profiles/new"
```

---

### Task 3: `SpendSummary` component + render on Credits (`/admin/spend`)

**Files:** Create `src/components/admin/SpendSummary.tsx`; Modify `src/app/(authed)/admin/spend/page.tsx`

This extracts the `SpendSection` + `Card` + `fmtUsd` currently in `src/app/(authed)/admin/score/page.tsx` (lines ~22–24, 136–220) into a reusable component, then renders it atop the Credits page. (The originals are deleted with `/admin/score` in Task 6.)

- [ ] **Step 1: Create `src/components/admin/SpendSummary.tsx`**:
```tsx
import type { VercelCreditsResult } from "@/lib/spend/vercel-ai-gateway";
import type { RecordedSpend } from "@/lib/spend/recorded";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}
function fmtUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// The two cost summary cards ("AI Agents" = LLM, "Deep Research" = Exa) + the
// Vercel account balance line. Each card links to the per-source detail on this
// same page (?source=llm|exa). All costs are ×mult for the viewer (super = 1).
export function SpendSummary({
  vercel,
  recorded,
  costMult,
}: {
  vercel: VercelCreditsResult;
  recorded: RecordedSpend | null;
  costMult: number;
}) {
  const total = recorded ? applyCostMultiplier(recorded.totalCents, costMult) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-bold tracking-tight">Spend</h2>
        <span className="text-sm text-zinc-400 tabular-nums">
          {total != null ? `${fmtCents(total)} total` : ""}
        </span>
      </div>
      <p className="text-xs text-zinc-500 -mt-1">
        Actual cost, summed from every eval. Each number is the real charge from
        its source. Click a box for row detail.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card href="/admin/spend?source=llm" label="AI Agents">
          <div className="text-3xl font-bold tabular-nums">{fmtCents(applyCostMultiplier(recorded?.llmCents, costMult))}</div>
          <div className="text-xs text-zinc-500 mt-1">
            real cost from Vercel per-generation billing
            {vercel.ok && (
              <span className="block text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                Vercel account: {fmtUsd(vercel.data.totalUsedUsd)} used (lifetime) ·{" "}
                {fmtUsd(vercel.data.balanceUsd)} left
              </span>
            )}
            {!vercel.ok && (
              <span className="block text-[10px] text-amber-500 mt-0.5">
                account total unavailable — {vercel.error}
              </span>
            )}
          </div>
        </Card>
        <Card href="/admin/spend?source=exa" label="Deep Research">
          <div className="text-3xl font-bold tabular-nums">{fmtCents(applyCostMultiplier(recorded?.exaCents, costMult))}</div>
          <div className="text-xs text-zinc-500 mt-1">
            real cost from Exa response billing
            <span className="block text-[10px] text-zinc-600 mt-0.5">
              {recorded ? `${recorded.trackedEvals} evals tracked` : ""}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 flex items-center justify-between">
        <span>{label}</span>
        {href && <span className="text-zinc-600">→</span>}
      </div>
      <div className="mt-2 flex-1">{children}</div>
    </>
  );
  const cls = "rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col";
  return href ? (
    <a href={href} className={`${cls} hover:border-zinc-600 transition-colors`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
```

- [ ] **Step 2: Render on `/admin/spend`** — modify `src/app/(authed)/admin/spend/page.tsx`.

Add imports (top, after the existing imports):
```ts
import { getVercelCredits } from "@/lib/spend/vercel-ai-gateway";
import { getRecordedSpend } from "@/lib/spend/recorded";
import { SpendSummary } from "@/components/admin/SpendSummary";
```
In the component body, after `const costMult = await getViewerCostMultiplier();`, add:
```ts
  // Summary cards (AI Agents / Deep Research + Vercel balance), degrade gracefully.
  const [vercel, recorded] = await Promise.all([
    getVercelCredits(),
    getRecordedSpend().catch(() => null),
  ]);
```
Then render `<SpendSummary>` just inside the returned root `<div className="flex flex-col gap-6">`, BEFORE the existing header block (`<div className="flex items-start justify-between">`):
```tsx
      <SpendSummary vercel={vercel} recorded={recorded} costMult={costMult} />
```

- [ ] **Step 3: Verify** — `pnpm tsc --noEmit && pnpm lint && pnpm build`. (Confirm `getVercelCredits`/`getRecordedSpend`/`RecordedSpend`/`VercelCreditsResult` import names match `src/lib/spend/*` — they're the same names `score/page.tsx` used.)

- [ ] **Step 4: Commit** — PRD entry. 
```bash
git add src/components/admin/SpendSummary.tsx "src/app/(authed)/admin/spend/page.tsx" PRD/events-v1.md
git commit -m "feat(admin): move Spend summary cards onto the Credits page"
```

---

### Task 4: `RunsPanel` on `/admin/profiles` + New Job/Re-Run All + redirect retargets

**Files:** Create `src/components/admin/RunsPanel.tsx`; Modify `src/app/(authed)/admin/profiles/page.tsx`, `src/components/admin/RerunButton.tsx`, `src/components/admin/RescoreAllButton.tsx`

- [ ] **Step 1: Retarget the two button redirects** — `RerunButton.tsx` line ~31 and `RescoreAllButton.tsx` line ~48, change `/admin/score/${...}` → `/admin/profiles/${...}`:
  - RerunButton: `router.push(`/admin/profiles/${json.jobId ?? jobId}`);`
  - RescoreAllButton: `router.push(`/admin/profiles/${json.jobId}`);`

- [ ] **Step 2: Create `src/components/admin/RunsPanel.tsx`** (server component — the jobs table from `score/page.tsx`, in a collapsible `<details>`, links → `/admin/profiles/<id>`):
```tsx
import { RerunButton } from "@/components/admin/RerunButton";
import { LocalTime } from "@/components/LocalTime";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

export type RunRow = {
  id: string;
  title: string | null;
  model: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  estimatedCents: number | null;
  actualCents: number;
  createdAt: Date;
};

function fmtCents(c: number | null | undefined): string {
  if (c == null) return "—";
  return `$${(c / 100).toFixed(2)}`;
}

// Collapsible list of scoring runs (so queued/running jobs with no scored
// profiles yet are still findable). Native <details>; open if any job is active.
export function RunsPanel({
  jobs,
  canRun,
  costMult,
}: {
  jobs: RunRow[];
  canRun: boolean;
  costMult: number;
}) {
  const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
  return (
    <details open={hasActive} className="border border-zinc-800 rounded-md">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm text-zinc-300 hover:text-white">
        Runs ({jobs.length})
      </summary>
      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Model</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Progress</th>
              <th className="text-right px-4 py-3">Est / Actual</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr className="border-t border-zinc-800">
                <td colSpan={7} className="px-4 py-6 text-zinc-500 text-sm">No runs yet.</td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <a href={`/admin/profiles/${j.id}`} className="text-white hover:text-zinc-300">
                      {j.title ?? <span className="text-zinc-500">untitled</span>}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{j.model}</td>
                  <td className="px-4 py-3"><StatusPill status={j.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.completedItems + j.failedItems} / {j.totalItems}
                    {j.failedItems > 0 && <span className="text-red-400 ml-2">({j.failedItems} failed)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
                    {fmtCents(applyCostMultiplier(j.estimatedCents, costMult))} / {fmtCents(applyCostMultiplier(j.actualCents, costMult))}
                  </td>
                  <td className="px-4 py-3 text-zinc-500"><LocalTime iso={j.createdAt.toISOString()} /></td>
                  <td className="px-4 py-3 text-right">
                    {canRun && ["completed", "failed", "cancelled"].includes(j.status) && (
                      <RerunButton jobId={j.id} totalItems={j.totalItems} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : status === "running"
        ? "text-blue-400 border-blue-400/30 bg-blue-400/10"
        : status === "failed"
          ? "text-red-400 border-red-400/30 bg-red-400/10"
          : status === "cancelled"
            ? "text-zinc-400 border-zinc-600 bg-zinc-800"
            : "text-amber-400 border-amber-400/30 bg-amber-400/10";
  return <span className={`px-2 py-0.5 rounded-full border text-xs ${color}`}>{status}</span>;
}
```

- [ ] **Step 3: Wire into `/admin/profiles/page.tsx`** — add the jobs/estimate/canRun reads and render the New Job button + RunsPanel + Re-Run All.

Add imports:
```ts
import { db } from "@/db";
import { scoringJobs, evaluations } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { can, getViewerCostMultiplier } from "@/lib/grants";
import { getEstimateCents } from "@/lib/admin";
import { RunsPanel } from "@/components/admin/RunsPanel";
import { RescoreAllButton } from "@/components/admin/RescoreAllButton";
```
(Note: `can` may already be imported — merge, don't duplicate. `applyCostMultiplier`/`getViewerCostMultiplier` likely already imported from the Phase A merge — check and don't duplicate.)

After the existing `superAdmin` line in the component, add the Phase B reads:
```ts
  const canRun = await can("run_scoring_jobs");
  const costMult = await getViewerCostMultiplier();
  const [jobs, profileCountRows, sonnetCents, opusCents] = await Promise.all([
    db.select().from(scoringJobs).orderBy(desc(scoringJobs.createdAt)).limit(50),
    db.select({ n: count() }).from(evaluations).where(eq(evaluations.source, "url")),
    getEstimateCents("sonnet"),
    getEstimateCents("opus"),
  ]);
  const profileCount = profileCountRows[0]?.n ?? 0;
```
In the JSX header block, add a New Job button next to the `<h1>Profiles scored</h1>`. Change the header `<div>` so the title row has the button on the right:
```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Profiles scored</h1>
          <p className="text-sm text-zinc-500 mt-1 tabular-nums">
            {profiles.length} profiles · avg cost {showCost(avgCostCents)} · total cost{" "}
            {showCost(totalCost)} · total charged {fmtCents(totalCharge)}
          </p>
        </div>
        {canRun && (
          <a
            href="/admin/profiles/new"
            className="shrink-0 rounded-md bg-white text-black font-medium px-4 py-2 text-sm hover:bg-zinc-200"
          >
            + New Bulk Scoring Job
          </a>
        )}
      </div>
```
(Adapt to the actual current header markup — the Phase A page uses `showCost`/`fmtCents` for the stats; keep those exactly as they are, only wrap the title+stats in a left `<div>` and add the button on the right.)

Then, between that header block and the `<ProfilesScoredTable>` (or the empty-state), render the runs panel + Re-Run All when `canRun`:
```tsx
      {canRun && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <RescoreAllButton
              count={profileCount}
              centsPerProfile={{ sonnet: sonnetCents, opus: opusCents }}
            />
          </div>
          <RunsPanel jobs={jobs} canRun={canRun} costMult={costMult} />
        </div>
      )}
```

- [ ] **Step 4: Verify** — `pnpm tsc --noEmit && pnpm lint && pnpm build`. Confirm `/admin/profiles` still builds and the jobs query types line up (`scoringJobs` row → `RunRow`; `createdAt` is a `Date`).

- [ ] **Step 5: Commit** — PRD entry. 
```bash
git add src/components/admin/RunsPanel.tsx "src/app/(authed)/admin/profiles/page.tsx" src/components/admin/RerunButton.tsx src/components/admin/RescoreAllButton.tsx PRD/events-v1.md
git commit -m "feat(admin): Runs panel + New Job/Re-Run All on /admin/profiles"
```

---

### Task 5: `JobLiveProgress` island + live single-run view + widened gate

**Files:** Create `src/components/admin/JobLiveProgress.tsx`; Modify `src/app/(authed)/admin/profiles/[jobId]/page.tsx`

- [ ] **Step 1: Create `src/components/admin/JobLiveProgress.tsx`** (refactor of `JobProgress`: keep poll + localhost auto-driver + header + progress bar; render ONLY non-`done` items; `router.refresh()` once on terminal transition; rerun-of link → `/admin/profiles/<id>`; no "← All jobs" link):
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

type Job = {
  id: string;
  title: string | null;
  model: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  estimatedCents: number | null;
  actualCents: number;
  rerunOfJobId: string | null;
};

type Item = {
  id: string;
  inputRaw: string;
  linkedinUrl: string | null;
  evaluationId: string | null;
  status: string;
  error: string | null;
  evalFullName: string | null;
  evalLlmCents: number | null;
  evalExaCents: number | null;
};

function fmt(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
function sumCents(items: Item[], pick: (it: Item) => number | null): number {
  return items.reduce((acc, it) => acc + (pick(it) ?? 0), 0);
}

const TERMINAL = ["completed", "failed", "cancelled"];

// Live job header + progress bar for /admin/profiles/[jobId]. Polls the job,
// drives the cron tick on localhost, and shows only the not-yet-scored items
// (scored ones render in the rich profiles table below). On the job reaching a
// terminal status it refreshes the server component once to pull in new profiles.
export function JobLiveProgress({ jobId, costMultiplier }: { jobId: string; costMultiplier: number }) {
  const router = useRouter();
  const costFmt = (c: number | null | undefined) => fmt(applyCostMultiplier(c, costMultiplier));
  const [data, setData] = useState<{ job: Job; items: Item[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickingRef = useRef(false);
  const refreshedRef = useRef(false); // fire router.refresh() once on completion

  useEffect(() => {
    let cancelled = false;
    const isLocalhost =
      typeof window !== "undefined" &&
      /^(localhost|127\.0\.0\.1)(:|$)/.test(window.location.hostname || "");

    async function driveCronTick(status: string) {
      if (!isLocalhost) return;
      if (status !== "queued" && status !== "running") return;
      if (tickingRef.current) return;
      tickingRef.current = true;
      try {
        await fetch("/api/cron/scoring-tick");
        if (!cancelled) await poll();
      } catch {
        /* ignore — next interval retries */
      } finally {
        tickingRef.current = false;
      }
    }

    async function poll() {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          if (!cancelled) setError(json.error || `HTTP ${res.status}`);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setError(null);
        if (TERMINAL.includes(json.job.status)) {
          if (!refreshedRef.current) {
            refreshedRef.current = true;
            router.refresh(); // pull newly-scored profiles into the table below
          }
        } else {
          void driveCronTick(json.job.status);
        }
      } catch {
        if (!cancelled) setError("network error");
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId, router]);

  if (error) return <div className="text-red-400 text-sm">Live progress error: {error}</div>;
  if (!data) return <div className="text-zinc-500 text-sm">Loading run status…</div>;

  const { job, items } = data;
  const pending = items.filter((it) => it.status !== "done");
  const pct =
    job.totalItems > 0
      ? Math.round(((job.completedItems + job.failedItems) / job.totalItems) * 100)
      : 0;
  const llmCents = sumCents(items, (it) => it.evalLlmCents);
  const exaCents = sumCents(items, (it) => it.evalExaCents);
  const terminal = TERMINAL.includes(job.status);

  // Fully done with nothing in flight → one-line summary.
  if (terminal && pending.length === 0) {
    return (
      <p className="text-sm text-zinc-500 tabular-nums">
        {job.model} · {job.status} · {job.completedItems}/{job.totalItems} done · est{" "}
        {costFmt(job.estimatedCents)} / actual {costFmt(job.actualCents)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {job.rerunOfJobId && (
          <a href={`/admin/profiles/${job.rerunOfJobId}`} className="text-xs text-[#dfa43a] hover:underline">
            ↻ re-run of an earlier job
          </a>
        )}
        <p className="text-sm text-zinc-500 tabular-nums">
          {job.model} · {job.status} · {job.completedItems}/{job.totalItems} done
          {job.failedItems > 0 && `, ${job.failedItems} failed`} · est {costFmt(job.estimatedCents)} / actual{" "}
          {costFmt(job.actualCents)}
        </p>
        <p className="text-xs text-zinc-600 tabular-nums">
          LLM {costFmt(llmCents)} · Exa {costFmt(exaCents)}
          <span className="text-zinc-700"> (eval costs; actual also includes handle resolution)</span>
        </p>
      </div>

      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {pending.length > 0 && (
        <div className="border border-zinc-800 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">In-flight subject</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((it) => (
                <tr key={it.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">
                    <div className="text-white">{it.evalFullName ?? it.inputRaw}</div>
                    {it.linkedinUrl && (
                      <span className="text-xs text-zinc-500 font-mono">
                        {it.linkedinUrl.replace(/^https?:\/\//, "")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><ItemStatus s={it.status} /></td>
                  <td className="px-4 py-3 text-xs text-amber-400 max-w-[24rem] truncate">{it.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItemStatus({ s }: { s: string }) {
  const color =
    s === "done"
      ? "text-emerald-400"
      : s === "scoring" || s === "resolving"
        ? "text-blue-400"
        : s === "failed"
          ? "text-red-400"
          : s === "skipped"
            ? "text-zinc-500"
            : "text-zinc-400";
  return <span className={`text-xs ${color}`}>{s}</span>;
}
```
Note: the `/api/admin/jobs/[id]` GET returns more `Item` fields than used here; only the listed fields are read — that's fine. Confirm the endpoint returns `job.rerunOfJobId`, `evalFullName`, `evalLlmCents`, `evalExaCents`, `status`, `error`, `evaluationId` (it does — `JobProgress` used them).

- [ ] **Step 2: Render on `/admin/profiles/[jobId]/page.tsx`** + widen gate + pass cost multiplier.

Add imports:
```ts
import { can, getViewerCostMultiplier } from "@/lib/grants";
import { JobLiveProgress } from "@/components/admin/JobLiveProgress";
```
(`can` is already imported in this file from Phase A — merge.)

Widen the gate — replace:
```ts
  if (!(await can("view_profiles"))) return <NotAuthorized email={null} />;
```
with:
```ts
  // Either grant can watch a run: view_profiles (the list) or run_scoring_jobs
  // (a scoring-only admin who just created it and was redirected here).
  if (!((await can("view_profiles")) || (await can("run_scoring_jobs")))) {
    return <NotAuthorized email={null} />;
  }
```
After resolving `job`, compute the multiplier (near the existing data prep):
```ts
  const costMult = await getViewerCostMultiplier();
```
In the JSX, render the live island between the header `<div>` and the table. After the closing of the header `<div>` (the one with the back link + title + "N scored…") and before the `{profiles.length === 0 ? … : <ProfilesScoredTable …/>}`, add:
```tsx
      <JobLiveProgress jobId={jobId} costMultiplier={costMult} />
```

- [ ] **Step 3: Verify** — `pnpm tsc --noEmit && pnpm lint && pnpm build`. Confirm `/admin/profiles/[jobId]` builds.

- [ ] **Step 4: Commit** — PRD entry. 
```bash
git add src/components/admin/JobLiveProgress.tsx "src/app/(authed)/admin/profiles/[jobId]/page.tsx" PRD/events-v1.md
git commit -m "feat(admin): live job progress island on the single-run profiles view"
```

---

### Task 6: Delete `/admin/score` + `JobProgress`, repoint hub card, final sweep

**Files:** Delete `src/app/(authed)/admin/score/` (3 pages) and `src/components/admin/JobProgress.tsx`; Modify `src/app/(authed)/admin/page.tsx`

- [ ] **Step 1: Repoint the hub card** — in `src/app/(authed)/admin/page.tsx`, change the Bulk Score `HubCard` href:
```tsx
        <HubCard
          href="/admin/profiles/new"
          icon={FiBarChart2}
          title="Bulk Score Founders & Investors"
          body="Paste a list or upload a CSV of people you'd like to generate scores for."
        />
```

- [ ] **Step 2: Delete the retired pages + component**:
```bash
git rm "src/app/(authed)/admin/score/page.tsx" "src/app/(authed)/admin/score/new/page.tsx" "src/app/(authed)/admin/score/[id]/page.tsx" src/components/admin/JobProgress.tsx
```
(Remove the now-empty `src/app/(authed)/admin/score/` dir if git leaves it.)

- [ ] **Step 3: Residual-reference sweep** — there must be NO remaining source references to the deleted routes/component:
```bash
grep -rn "/admin/score" src ; grep -rn "JobProgress" src
```
Expected: no matches (the `rerunOfJobId` links, redirects, nav, hub, and `JobProgress` import were all retargeted/removed in Tasks 1–5). Fix any stragglers.

- [ ] **Step 4: Full verification**:
```bash
pnpm tsc --noEmit
pnpm vitest run tests/lib/admin-nav.test.ts tests/app/rescore-all.test.ts
pnpm build
```
Expected: tsc clean; admin-nav tests pass; `rescore-all` passes (run alone; it's a DB test — a 5000ms timeout is infra, retry with `--no-file-parallelism`); build shows `/admin/profiles`, `/admin/profiles/new`, `/admin/profiles/[jobId]`, `/admin/spend` and NO `/admin/score*`. `pnpm lint` clean for touched files.

- [ ] **Step 5: Commit** — PRD entry ("Phase B task 6: deleted /admin/score + JobProgress; hub card → /admin/profiles/new; sweep clean").
```bash
git add -A
git commit -m "feat(admin): retire /admin/score (folded onto /admin/profiles)"
```

---

## Self-review (author)
- **Spec coverage:** live island on [jobId] (T5) ✓; widened gate (T5) ✓; Runs panel + New Job + Re-Run All on /admin/profiles (T4) ✓; new-job page move + redirects (T2, T4) ✓; Spend cards → Credits (T3) ✓; nav repoint + activeNavHref + hub card (T1, T6) ✓; deletions + sweep (T6) ✓; no migration ✓; backend routes untouched ✓.
- **Type consistency:** `RunRow` matches a `scoringJobs` select row (createdAt: Date). `JobLiveProgress` `Job`/`Item` subset of the `/api/admin/jobs/[id]` payload (same fields `JobProgress` read). `activeNavHref(pathname, hrefs: string[])` signature matches its test + `AdminNav` call. `SpendSummary` props match `score/page.tsx`'s old `SpendSection`.
- **Placeholder scan:** none. Each code step is complete; the "(adapt to the actual current header markup)" note in T4 references real existing code the implementer can see.
- **Order:** T1–T5 retarget every `/admin/score` reference and the `JobProgress` usage BEFORE T6 deletes them, so the T6 grep sweep comes back clean.
