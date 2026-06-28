# Event Attendee Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins curate an event's attendee list (see / add-by-search / remove) and kick off a bulk "Re-Score All" job for attendees, on the existing `/admin/events/[id]` page.

**Architecture:** Augment the existing `eventAttendees` table with `source` + `removedByAdmin` so manual edits survive the idempotent Luma re-sync. Manual adds upsert a row keyed on a synthetic `manual:<evalId>` Luma id; removes are soft-deletes. The single resolver (`resolveEventAttendeeEvalIds`) gains a `removedByAdmin=false` filter, which automatically covers public rendering. Add/remove go through `manage_events`-gated routes; Re-Score All mirrors the existing `/api/admin/rescore-all` async-job pattern under a stricter `run_scoring_jobs` grant.

**Tech Stack:** Next.js 16 App Router (route handlers + RSC), Drizzle ORM + Neon Postgres, Clerk auth/grants, Vitest (DB-backed, `skipIf(IS_PROD_DB)`).

**Spec:** `docs/superpowers/specs/2026-06-09-event-attendee-management-design.md`

**Branch:** `event-attendee-management` (already created off `origin/main`; the spec doc is already committed there).

---

## File Structure

- **Modify** `src/db/schema.ts` — add `source` + `removedByAdmin` columns to `eventAttendees`.
- **Create** `drizzle/00XX_*.sql` — generated migration (via `pnpm db:generate`).
- **Modify** `src/lib/events.ts` — add `removedByAdmin=false` filter to `resolveEventAttendeeEvalIds`.
- **Create** `src/lib/event-attendees-admin.ts` — admin list/add/remove helpers (kept out of the already-large `events.ts`).
- **Create** `tests/app/event-attendees-admin.test.ts` — DB-backed tests for the lib helpers + resolver filter.
- **Create** `src/app/api/admin/events/[id]/attendees/route.ts` — `POST` add.
- **Create** `src/app/api/admin/events/[id]/attendees/[attendeeId]/route.ts` — `DELETE` remove.
- **Create** `src/app/api/admin/events/[id]/rescore-attendees/route.ts` — `POST` bulk re-score.
- **Create** `tests/app/rescore-attendees.test.ts` — DB-backed test for the bulk-enqueue route.
- **Create** `src/components/admin/AttendeeManager.tsx` — client UI (search-add + list + remove + Re-Score All).
- **Modify** `src/app/(authed)/admin/events/[id]/page.tsx` — server-render the list + render `<AttendeeManager>`.
- **Modify** `PRD/event-attendee-management.md` — progress journal (every commit).

> **PRD reminder:** This repo requires updating `PRD/event-attendee-management.md` on every commit (a `.husky/pre-commit` hook reminds you). Commit with `git -c core.hooksPath=.husky commit …`. Never `--no-verify`.

---

### Task 1: Add `source` + `removedByAdmin` columns to `eventAttendees`

**Files:**
- Modify: `src/db/schema.ts` (the `eventAttendees` table, ~lines 723–750)
- Create: `drizzle/00XX_*.sql` (generated)
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Add the two columns to the schema**

In `src/db/schema.ts`, inside the `eventAttendees` `pgTable` column block, add `source` and `removedByAdmin` right after the `name` column. (`boolean` is already imported at the top of the file.)

```ts
    email: text("email"), // lowercased; null if Luma had none
    name: text("name"),
    // "luma" = imported from the Luma guest-list sync; "manual" = added by an
    // admin via the attendee manager. Manual rows use a synthetic
    // lumaGuestApiId of "manual:<evaluationId>".
    source: text("source").notNull().default("luma"),
    // Soft-delete. Admin "remove" sets this true; the Luma re-sync's
    // onConflictDoUpdate does NOT touch it, so removed guests stay removed
    // across re-syncs. resolveEventAttendeeEvalIds + the admin list filter it.
    removedByAdmin: boolean("removed_by_admin").notNull().default(false),
    approvalStatus: text("approval_status").notNull().default("pending"),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit prints a new migration filename (e.g. `drizzle/0039_*.sql`) containing `ALTER TABLE "event_attendees" ADD COLUMN "source" …` and `… ADD COLUMN "removed_by_admin" …`. No interactive prompts (pure additive columns with defaults).

- [ ] **Step 3: Apply to the dev database**

Run: `pnpm db:push`
Expected: drizzle-kit reports the two columns added, "Changes applied". (This targets the **dev** Neon DB via `.env.local` — fine for local work. Do NOT run this against prod; prod picks up the committed migration through the normal deploy path.)

- [ ] **Step 4: Verify the schema compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

Update `PRD/event-attendee-management.md` (prepend a new entry noting the schema + migration), then:

```bash
git add src/db/schema.ts drizzle/ PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(db): add source + removedByAdmin to event_attendees"
```

---

### Task 2: Resolver filter + admin lib helpers

**Files:**
- Modify: `src/lib/events.ts` (`resolveEventAttendeeEvalIds`, ~line 133)
- Create: `src/lib/event-attendees-admin.ts`
- Test: `tests/app/event-attendees-admin.test.ts`
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Write the failing test**

Create `tests/app/event-attendees-admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";
import { resolveEventAttendeeEvalIds } from "@/lib/events";
import {
  listEventAttendeesAdmin,
  addManualAttendee,
  removeAttendee,
} from "@/lib/event-attendees-admin";

const rnd = () => Math.random().toString(36).slice(2, 8);

async function seedEval(name: string, score = 80) {
  const [ev] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: "https://linkedin.com/in/adm-" + rnd(),
      fullName: name,
      score,
      founderScore: score,
      investorScore: 0,
      signalQuality: "high",
      source: "url",
    })
    .returning();
  return ev;
}

async function seedEvent() {
  const [e] = await db
    .insert(events)
    .values({
      slug: "adm-att-" + rnd(),
      title: "Admin Attendee Test",
      startsAt: new Date("2026-06-01"),
      status: "open",
      criteria: {},
      source: "luma",
    })
    .returning();
  return e;
}

describe.skipIf(IS_PROD_DB)("event-attendees-admin", () => {
  it("adds a manual attendee, lists it matched, and re-add un-removes", async () => {
    const event = await seedEvent();
    const ev = await seedEval("Manual Person " + rnd(), 123);

    const added = await addManualAttendee(event.id, ev.id);
    expect(added.ok).toBe(true);

    let list = await listEventAttendeesAdmin(event.id);
    const mine = list.find((r) => r.evaluationId === ev.id);
    expect(mine).toBeTruthy();
    expect(mine!.matched).toBe(true);
    expect(mine!.source).toBe("manual");
    expect(mine!.combinedScore).toBe(123);

    // Remove → excluded from list AND from the resolver.
    const removed = await removeAttendee(event.id, mine!.id);
    expect(removed).toBe(true);
    list = await listEventAttendeesAdmin(event.id);
    expect(list.find((r) => r.evaluationId === ev.id)).toBeFalsy();
    const { evalIds } = await resolveEventAttendeeEvalIds(event.id);
    expect(evalIds).not.toContain(ev.id);

    // Re-add the same person → upsert un-removes (no duplicate row).
    await addManualAttendee(event.id, ev.id);
    const rows = await db
      .select({ id: eventAttendees.id })
      .from(eventAttendees)
      .where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.evaluationId, ev.id)));
    expect(rows.length).toBe(1);
    const { evalIds: again } = await resolveEventAttendeeEvalIds(event.id);
    expect(again).toContain(ev.id);
  });

  it("resolver excludes admin-removed Luma rows", async () => {
    const event = await seedEvent();
    const ev = await seedEval("Luma Person " + rnd());
    // Simulate a synced, approved, email-matched Luma row.
    const [row] = await db
      .insert(eventAttendees)
      .values({
        eventId: event.id,
        evaluationId: ev.id,
        lumaGuestApiId: "gst-" + rnd(),
        name: "Luma Person",
        approvalStatus: "approved",
        source: "luma",
      })
      .returning();

    let { evalIds } = await resolveEventAttendeeEvalIds(event.id);
    expect(evalIds).toContain(ev.id);

    await removeAttendee(event.id, row.id);
    ({ evalIds } = await resolveEventAttendeeEvalIds(event.id));
    expect(evalIds).not.toContain(ev.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/app/event-attendees-admin.test.ts`
Expected: FAIL — `@/lib/event-attendees-admin` has no exports `listEventAttendeesAdmin` / `addManualAttendee` / `removeAttendee` (module not found / undefined).

- [ ] **Step 3: Add the `removedByAdmin` filter to the resolver**

In `src/lib/events.ts`, in `resolveEventAttendeeEvalIds`, extend the `where` clause:

```ts
  const attendees = await db
    .select({ evaluationId: eventAttendees.evaluationId, name: eventAttendees.name })
    .from(eventAttendees)
    .where(
      and(
        eq(eventAttendees.eventId, eventId),
        eq(eventAttendees.approvalStatus, "approved"),
        eq(eventAttendees.removedByAdmin, false),
      ),
    );
```

- [ ] **Step 4: Create the admin lib helpers**

Create `src/lib/event-attendees-admin.ts`:

```ts
import { db } from "@/db";
import { eventAttendees, evaluations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

// One row in the admin attendee manager. Matched rows carry a profile link +
// combined score; unmatched rows are name-only (no Festival profile).
export type AdminAttendeeRow = {
  id: string; // eventAttendees.id — the handle for Remove
  name: string | null;
  source: string; // "luma" | "manual"
  evaluationId: string | null;
  matched: boolean;
  profileHref: string | null;
  combinedScore: number | null;
};

// Current (non-removed) attendees for the admin manager. Matched rows are
// deduped by evaluationId (a person can exist as both a Luma row and a manual
// row) and enriched with profile href + score. Sorted: matched by score desc,
// then unmatched.
export async function listEventAttendeesAdmin(eventId: string): Promise<AdminAttendeeRow[]> {
  const rows = await db
    .select({
      id: eventAttendees.id,
      name: eventAttendees.name,
      source: eventAttendees.source,
      evaluationId: eventAttendees.evaluationId,
    })
    .from(eventAttendees)
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.removedByAdmin, false)));

  const evalIds = [...new Set(rows.filter((r) => r.evaluationId).map((r) => r.evaluationId!))];
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const lbRows = evalIds.length ? await getLeaderboardRowsForEvalIds(evalIds) : [];
  const lbById = new Map(lbRows.map((r) => [r.id, r]));

  const seenEval = new Set<string>();
  const out: AdminAttendeeRow[] = [];
  for (const r of rows) {
    if (r.evaluationId) {
      if (seenEval.has(r.evaluationId)) continue;
      seenEval.add(r.evaluationId);
      const lb = lbById.get(r.evaluationId);
      out.push({
        id: r.id,
        name: r.name,
        source: r.source,
        evaluationId: r.evaluationId,
        matched: !!lb,
        profileHref: lb?.profileHref ?? null,
        combinedScore: lb?.combinedScore ?? null,
      });
    } else {
      out.push({
        id: r.id,
        name: r.name,
        source: r.source,
        evaluationId: null,
        matched: false,
        profileHref: null,
        combinedScore: null,
      });
    }
  }
  out.sort((a, b) => (b.combinedScore ?? -1) - (a.combinedScore ?? -1));
  return out;
}

// Add (or un-remove) a manual attendee from a scored profile. Upserts on the
// synthetic key "manual:<evalId>" so the same person can't be double-added and
// re-adding a removed person just flips removedByAdmin back to false.
export async function addManualAttendee(
  eventId: string,
  evaluationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const [ev] = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, foundEmail: evaluations.foundEmail })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev) return { ok: false, error: "not_found" };

  await db
    .insert(eventAttendees)
    .values({
      eventId,
      evaluationId: ev.id,
      lumaGuestApiId: `manual:${ev.id}`,
      email: ev.foundEmail?.toLowerCase() ?? null,
      name: ev.fullName ?? null,
      approvalStatus: "approved",
      source: "manual",
      removedByAdmin: false,
    })
    .onConflictDoUpdate({
      target: [eventAttendees.eventId, eventAttendees.lumaGuestApiId],
      set: {
        evaluationId: ev.id,
        approvalStatus: "approved",
        source: "manual",
        removedByAdmin: false,
        name: ev.fullName ?? null,
        updatedAt: sql`now()`,
      },
    });
  return { ok: true };
}

// Soft-delete an attendee (Luma or manual) by row id, scoped to the event.
// Returns false if no such row.
export async function removeAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  const [row] = await db
    .update(eventAttendees)
    .set({ removedByAdmin: true, updatedAt: sql`now()` })
    .where(and(eq(eventAttendees.id, attendeeId), eq(eventAttendees.eventId, eventId)))
    .returning({ id: eventAttendees.id });
  return !!row;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/app/event-attendees-admin.test.ts`
Expected: PASS (2 tests). If your local `.env.local` points at the prod DB, the suite is skipped — re-point at the dev DB and re-run.

- [ ] **Step 6: Commit**

Update the PRD, then:

```bash
git add src/lib/events.ts src/lib/event-attendees-admin.ts tests/app/event-attendees-admin.test.ts PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(events): admin attendee list/add/remove helpers + resolver filter"
```

---

### Task 3: Add + remove API routes

**Files:**
- Create: `src/app/api/admin/events/[id]/attendees/route.ts`
- Create: `src/app/api/admin/events/[id]/attendees/[attendeeId]/route.ts`
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Create the add route**

Create `src/app/api/admin/events/[id]/attendees/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { addManualAttendee } from "@/lib/event-attendees-admin";

export const runtime = "nodejs";

type Body = { evaluationId?: string };

// POST /api/admin/events/:id/attendees — add a manual attendee by evaluationId.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const evaluationId = body.evaluationId?.trim();
  if (!evaluationId) {
    return NextResponse.json({ error: "missing evaluationId" }, { status: 400 });
  }

  const result = await addManualAttendee(id, evaluationId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "failed" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the remove route**

Create `src/app/api/admin/events/[id]/attendees/[attendeeId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { removeAttendee } from "@/lib/event-attendees-admin";

export const runtime = "nodejs";

// DELETE /api/admin/events/:id/attendees/:attendeeId — soft-delete an attendee.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attendeeId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, attendeeId } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ok = await removeAttendee(id, attendeeId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

Update the PRD, then:

```bash
git add "src/app/api/admin/events/[id]/attendees" PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(api): add + remove event attendee routes"
```

---

### Task 4: Re-Score All route

**Files:**
- Create: `src/app/api/admin/events/[id]/rescore-attendees/route.ts`
- Test: `tests/app/rescore-attendees.test.ts`
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Write the failing test**

Create `tests/app/rescore-attendees.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { db } from "@/db";
import { events, eventAttendees, evaluations, scoringJobItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

const rnd = () => Math.random().toString(36).slice(2, 8);

// The route is grant-gated + credit-held; stub those so the test exercises the
// selection + enqueue logic (the part this feature owns).
vi.mock("@/lib/grants", () => ({ requireGrant: vi.fn(async () => {}) }));
vi.mock("@/lib/ownership", () => ({
  canAccessEvent: vi.fn(async () => true),
  viewerIsUsersScoped: vi.fn(async () => false),
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn(async () => null) }));
vi.mock("@/lib/job-credit-hold", () => ({
  holdCreditsForJob: vi.fn(async () => ({ kind: "ok", creditHoldCents: 0 })),
}));

describe.skipIf(IS_PROD_DB)("POST rescore-attendees", () => {
  it("enqueues one job item per matched, url-sourced attendee", async () => {
    const { POST } = await import(
      "@/app/api/admin/events/[id]/rescore-attendees/route"
    );

    const [event] = await db
      .insert(events)
      .values({
        slug: "rsc-" + rnd(),
        title: "Rescore Test",
        startsAt: new Date("2026-06-01"),
        status: "open",
        criteria: {},
        source: "luma",
      })
      .returning();

    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: "https://linkedin.com/in/rsc-" + rnd(),
        fullName: "Rescore Person",
        score: 50,
        founderScore: 50,
        investorScore: 0,
        signalQuality: "high",
        source: "url",
      })
      .returning();

    await db.insert(eventAttendees).values({
      eventId: event.id,
      evaluationId: ev.id,
      lumaGuestApiId: "gst-" + rnd(),
      name: "Rescore Person",
      approvalStatus: "approved",
      source: "luma",
    });

    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: event.id }),
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(1);
    expect(json.jobId).toBeTruthy();

    const items = await db
      .select({ evaluationId: scoringJobItems.evaluationId, status: scoringJobItems.status })
      .from(scoringJobItems)
      .where(eq(scoringJobItems.jobId, json.jobId));
    expect(items.length).toBe(1);
    expect(items[0]!.evaluationId).toBe(ev.id);
    expect(items[0]!.status).toBe("resolved");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/app/rescore-attendees.test.ts`
Expected: FAIL — the route module doesn't exist yet (import error).

- [ ] **Step 3: Create the route**

Create `src/app/api/admin/events/[id]/rescore-attendees/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scoringJobs, scoringJobItems, evaluations } from "@/db/schema";
import { inArray, and, eq } from "drizzle-orm";
import { isScoringModel, estimateJobCents } from "@/lib/admin";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent, viewerIsUsersScoped } from "@/lib/ownership";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { resolveEventAttendeeEvalIds } from "@/lib/events";
import { getEventById } from "@/lib/events";
import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { model?: string };

// POST /api/admin/events/:id/rescore-attendees — enqueue a bulk re-score for an
// event's matched attendees. Mirrors /api/admin/rescore-all: creates a queued
// scoringJob with one pre-resolved item per eval; the cron drains it. Spends
// credits, so it's gated by run_scoring_jobs (stricter than manage_events).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (await viewerIsUsersScoped()) {
    return NextResponse.json({ error: "forbidden_scope" }, { status: 403 });
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

  // Matched, non-removed, approved attendee evals; skip source="code" (manual
  // scores reEvaluate refuses to touch).
  const { evalIds } = await resolveEventAttendeeEvalIds(id);
  const profiles = evalIds.length
    ? await db
        .select({ id: evaluations.id, linkedinUrl: evaluations.linkedinUrl, fullName: evaluations.fullName })
        .from(evaluations)
        .where(and(inArray(evaluations.id, evalIds), eq(evaluations.source, "url")))
    : [];

  if (profiles.length === 0) {
    return NextResponse.json({ jobId: null, count: 0 });
  }

  const event = await getEventById(id);
  const user = await currentUser();
  const createdByEmail = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? null;

  const estimate = await estimateJobCents(profiles.length, model);
  const hold = await holdCreditsForJob(user?.id ?? null, estimate);
  if (hold.kind === "insufficient") {
    return NextResponse.json(
      { error: "insufficient_credits", balanceCents: hold.balanceCents, neededCents: hold.neededCents, topupUrl: "/admin/credits" },
      { status: 402 },
    );
  }

  const [job] = await db
    .insert(scoringJobs)
    .values({
      title: `Re-score event attendees — ${event?.title ?? id}`,
      model,
      status: "queued",
      totalItems: profiles.length,
      estimatedCents: estimate,
      createdByEmail,
      createdByClerkUserId: user?.id ?? null,
      creditHoldCents: hold.creditHoldCents,
    })
    .returning();

  const rows = profiles.map((p) => ({
    jobId: job!.id,
    inputRaw: p.fullName ?? p.linkedinUrl,
    linkedinUrl: p.linkedinUrl,
    evaluationId: p.id,
    status: "resolved" as const,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(scoringJobItems).values(rows.slice(i, i + CHUNK));
  }

  return NextResponse.json({ jobId: job!.id, count: profiles.length, estimatedCents: job!.estimatedCents });
}
```

> Note: `holdCreditsForJob` returns `{ kind: "ok", creditHoldCents }` or `{ kind: "insufficient", … }` (confirmed in `src/app/api/admin/rescore-all/route.ts`). If the real shape differs, mirror exactly what `rescore-all` does.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/app/rescore-attendees.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

Update the PRD, then:

```bash
git add "src/app/api/admin/events/[id]/rescore-attendees" tests/app/rescore-attendees.test.ts PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(api): bulk re-score event attendees route"
```

---

### Task 5: AttendeeManager client component

**Files:**
- Create: `src/components/admin/AttendeeManager.tsx`
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Create the component**

Create `src/components/admin/AttendeeManager.tsx`. It renders the current list (server-provided), a search-add box modeled on `HeaderSearch` (same `/api/leaderboard/search` backend + `ScoreThemPrompt` empty state, but the result action **adds** the attendee), and a Re-Score All button.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardRow } from "@/lib/leaderboard";
import type { AdminAttendeeRow } from "@/lib/event-attendees-admin";
import { ScoreThemPrompt } from "@/components/ScoreThemPrompt";

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

export function AttendeeManager({
  eventId,
  initialAttendees,
  canRescore,
}: {
  eventId: string;
  initialAttendees: AdminAttendeeRow[];
  canRescore: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const genRef = useRef(0);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_CHARS;

  // Debounced search against the same endpoint HeaderSearch uses.
  useEffect(() => {
    if (!active) {
      genRef.current++;
      return;
    }
    const myGen = ++genRef.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(trimmed)}`);
          if (!res.ok) throw new Error(String(res.status));
          const data: { rows: LeaderboardRow[] } = await res.json();
          if (!cancelled && genRef.current === myGen) {
            setResults(data.rows);
            setLoading(false);
          }
        } catch {
          if (!cancelled && genRef.current === myGen) {
            setResults([]);
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, active]);

  // Close dropdown on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setFocused(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocused(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function add(evaluationId: string) {
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId }),
      });
      if (res.ok) {
        setQuery("");
        setResults(null);
        setFocused(false);
        router.refresh();
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(attendeeId: string) {
    setBusyId(attendeeId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function rescoreAll() {
    const matched = initialAttendees.filter((a) => a.matched).length;
    if (matched === 0) return;
    if (!confirm(`Re-score ${matched} matched attendee(s)? This kicks off a background scoring job and spends credits.`)) {
      return;
    }
    setRescoring(true);
    setRescoreMsg(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/rescore-attendees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        setRescoreMsg(json.count > 0 ? `Queued ${json.count} attendee(s) — scoring runs in the background.` : "No matched attendees to re-score.");
      } else if (json.error === "insufficient_credits") {
        setRescoreMsg("Insufficient credits — top up at /admin/credits.");
      } else {
        setRescoreMsg(`Error: ${json.error ?? res.status}`);
      }
    } catch {
      setRescoreMsg("Error kicking off re-score.");
    } finally {
      setRescoring(false);
    }
  }

  const visible = results ? results.slice(0, MAX_RESULTS) : [];
  const settledEmpty = active && !loading && results !== null && results.length === 0;
  const matchedCount = initialAttendees.filter((a) => a.matched).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Starts from the Luma guest list. Add people who attended but weren’t on the RSVP list, or remove no-shows.
        </p>
        {canRescore && (
          <button
            type="button"
            onClick={rescoreAll}
            disabled={rescoring || matchedCount === 0}
            className="shrink-0 rounded-md border border-amber-500/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
          >
            {rescoring ? "Queuing…" : `Re-Score All (${matchedCount})`}
          </button>
        )}
      </div>
      {rescoreMsg && <p className="text-sm text-zinc-400">{rescoreMsg}</p>}

      {/* Add by search — same backend + ScoreThemPrompt fallback as HeaderSearch. */}
      <div ref={containerRef} className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Add attendee — search by name…"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
        />
        {focused && active && (
          <div className="absolute left-0 z-50 mt-1 w-full max-w-md overflow-hidden rounded-md border border-zinc-800 bg-[#151515] shadow-xl shadow-black/40">
            {loading && (results === null || results.length === 0) ? (
              <div className="px-3 py-3 text-sm text-zinc-500">Searching…</div>
            ) : settledEmpty ? (
              <ScoreThemPrompt name={trimmed} />
            ) : (
              <ul className="max-h-[50vh] overflow-y-auto py-1">
                {visible.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={adding}
                      onClick={() => add(row.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 disabled:opacity-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                        {row.fullName ?? "(unnamed)"}
                        {row.companyName && <span className="text-zinc-500">, {row.companyName}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                        {row.combinedScore.toLocaleString("en-US")}
                      </span>
                      <span className="shrink-0 text-xs text-[#dfa43a]">+ Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Current attendees */}
      {initialAttendees.length === 0 ? (
        <p className="text-sm text-zinc-500">No attendees yet. Run the Luma sync or add people above.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {initialAttendees.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {a.profileHref ? (
                  <a href={a.profileHref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {a.name ?? "(unnamed)"}
                  </a>
                ) : (
                  <span className="text-zinc-400">{a.name ?? "(unnamed)"} · unmatched</span>
                )}
              </span>
              <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                {a.source}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-zinc-300">
                {a.combinedScore != null ? a.combinedScore.toLocaleString("en-US") : "—"}
              </span>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => remove(a.id)}
                className="shrink-0 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

> `LeaderboardRow` fields used here are confirmed present in `src/lib/leaderboard.ts`: `id`, `fullName`, `companyName`, `combinedScore`, `profileHref`. The add action keys on `row.id` (the evaluationId).

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `LeaderboardRow` lacks `profileHref`/`combinedScore`/`id`, adjust to the real field names — verify against `src/lib/leaderboard.ts`’s `LeaderboardRow` type.)

- [ ] **Step 3: Commit**

Update the PRD, then:

```bash
git add src/components/admin/AttendeeManager.tsx PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(admin): AttendeeManager component (search-add + remove + re-score)"
```

---

### Task 6: Wire into the admin event page

**Files:**
- Modify: `src/app/(authed)/admin/events/[id]/page.tsx`
- Modify: `PRD/event-attendee-management.md`

- [ ] **Step 1: Import the helper, component, and grant check**

At the top of `src/app/(authed)/admin/events/[id]/page.tsx`, add:

```ts
import { listEventAttendeesAdmin } from "@/lib/event-attendees-admin";
import { AttendeeManager } from "@/components/admin/AttendeeManager";
import { can } from "@/lib/grants";
```

> `can(grant): Promise<boolean>` is the confirmed page-level grant helper (`src/lib/grants.ts:65`; used widely, e.g. `admin/sponsors/page.tsx` → `can("manage_events")`). Use it to compute `canRescore`.

- [ ] **Step 2: Fetch the attendee list + rescore permission**

Add `listEventAttendeesAdmin(id)` to the existing `Promise.all` (the array around line 46), and compute `canRescore`. For example, change the destructuring to include `attendees`, and after the `Promise.all` add:

```ts
  const canRescore = await can("run_scoring_jobs");
```

The `Promise.all` becomes:

```ts
  const [applicants, photos, allHosts, eventHostsList, allSponsors, eventSponsorsList, priorities, attendees] =
    await Promise.all([
      listApplicants({ eventId: event.id, status, limit: 200 }),
      getEventPhotos(id),
      listHosts(),
      getHostsForEvent(id),
      listSponsors(),
      getSponsorsForEvent(id),
      getEventPriorities(id),
      listEventAttendeesAdmin(id),
    ]);
```

- [ ] **Step 3: Render the Attendees section**

In the "Recap & content" block (the `<div className="flex flex-col gap-8 border-t border-zinc-800 pt-8">`), add a new `<section>` — place it right after the Photos section (attendees + photos are the public-recap pieces):

```tsx
        <section className="flex flex-col gap-4">
          <h3 className="font-display text-lg font-semibold">Attendees</h3>
          <AttendeeManager eventId={event.id} initialAttendees={attendees} canRescore={canRescore} />
        </section>
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: "✓ Compiled successfully" and no type errors.

- [ ] **Step 5: Manual smoke test (dev server)**

Run: `pnpm dev` and open `/admin/events/<a real event id>`.
Verify: the Attendees section lists the event's synced attendees; typing a name shows profiles; clicking one adds them (list refreshes); Remove drops a row; Re-Score All shows the confirm + "Queued N…" message. (Use a real event that has had a Luma sync.)

- [ ] **Step 6: Commit**

Update the PRD, then:

```bash
git add "src/app/(authed)/admin/events/[id]/page.tsx" PRD/event-attendee-management.md
git -c core.hooksPath=.husky commit -m "feat(admin): wire AttendeeManager into the event page"
```

---

### Task 7: Final verification + PR

- [ ] **Step 1: Full typecheck + test + build**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: tsc clean; all vitest suites pass (attendee-admin + rescore-attendees included; DB suites skip only if pointed at prod); build compiles.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin event-attendee-management
gh pr create --base main --head event-attendee-management \
  --title "feat: event attendee management + Re-Score All" \
  --body "See docs/superpowers/specs/2026-06-09-event-attendee-management-design.md. Adds see/add/remove attendees on /admin/events/[id] (survives Luma re-sync via source + removedByAdmin) and a Re-Score All bulk-scoring job."
```

- [ ] **Step 3: Prod migration note**

In the PR description, call out that this PR adds a Drizzle migration (`drizzle/00XX_*.sql`) for two `event_attendees` columns, which must be applied to the **prod** Neon DB through the normal deploy path (NOT `db:push` from a checkout). Confirm the deploy applies pending migrations before merging, or coordinate the prod migration with DROdio.

---

## Self-Review notes (already checked)

- **Spec coverage:** see list (Task 2/6), add (Task 2/3/5), remove (Task 2/3/5), Re-Score All (Task 4/5), data model + migration (Task 1), resolver filter for public rendering (Task 2), endpoints table (Tasks 3–4), testing (Tasks 2,4). All spec sections map to a task.
- **Type consistency:** `AdminAttendeeRow` defined in Task 2 is consumed unchanged in Tasks 5–6; `addManualAttendee`/`removeAttendee`/`listEventAttendeesAdmin` signatures match across tasks; route shapes (`{ evaluationId }`, `{ jobId, count, estimatedCents }`) match the component’s fetch calls.
- **Known verification points flagged inline:** exact `LeaderboardRow` field names (Task 5), the page-level grant-check helper name `can` vs `requireGrant` (Task 6), and the `holdCreditsForJob` return shape (Task 4) — each notes "verify against the real source" because they depend on existing code the executor must confirm.
