# Admin RBAC — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a non-admin sign in directly from `/admin` (no profile claim) and request admin access; let super admins approve/deny those requests on a new `/admin/users` page; approved users become full admins.

**Architecture:** A new `admin_access` DB table holds one row per requester keyed on Clerk user id (`pending`/`approved`/`denied`). `isAdmin()` is extended to also pass for super admins (hardcoded email constant) and approved rows. The admin layout stops redirecting non-admins and instead renders a client `<AdminAccessGate>` (Clerk `openSignIn` when signed out, a Request button when signed in). `/admin/users` (super-admin-only in Phase 1) lists requests with Approve/Deny calling an admin-gated decision route.

**Tech Stack:** Next.js 16 App Router (route handlers, server + client components), Drizzle ORM (neon-http), Clerk (`currentUser`/`auth`/`useClerk`), Vitest (tests run against the shared dev Neon DB).

**Spec:** `docs/superpowers/specs/2026-05-26-admin-rbac-design.md`

---

## File structure (Phase 1)

- **Create** `src/lib/admin-access.ts` — pure DB CRUD for `admin_access` (status lookup, request upsert, list, decide). No auth logic here.
- **Modify** `src/lib/admin.ts` — add `SUPER_ADMIN_EMAILS`, `isSuperAdmin()`; extend `isAdmin()` + `adminGate()` to accept super admins and approved rows.
- **Modify** `src/db/schema.ts` — add `adminAccess` table. (`role_id` deferred to Phase 2.)
- **Create** `drizzle/0009_*.sql` (+ snapshot) — generated migration.
- **Create** `src/components/admin/AdminAccessGate.tsx` — client gate (sign-in / request).
- **Modify** `src/app/(authed)/admin/layout.tsx` — gate instead of `redirect("/")`; super-admin-only `Users` nav link.
- **Create** `src/app/api/admin/access/request/route.ts` — caller upserts own pending row.
- **Create** `src/app/api/admin/access/[id]/decision/route.ts` — super-admin approve/deny.
- **Create** `src/app/(authed)/admin/users/page.tsx` — super-admin-only requests page.
- **Create** `src/components/admin/AdminAccessTable.tsx` — client list with Approve/Deny.
- **Tests:** `tests/lib/admin-access.test.ts`, `tests/app/admin-access-request.test.ts`, `tests/app/admin-access-decision.test.ts`.

Note on testing DB: the suite runs against the live dev Neon branch (see `tests/app/rescore-all.test.ts`). So the `admin_access` table must exist there before Task 2 tests run — Task 1 pushes it. Tests create rows with a random `clerkUserId` and delete them in cleanup, so they never collide with real data.

---

### Task 1: `admin_access` table + migration + push to dev DB

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0009_*.sql` (+ `drizzle/meta/0009_snapshot.json`) — generated
- Modify: `PRD/events-v1.md`

- [ ] **Step 1: Add the table to the schema**

Add to `src/db/schema.ts` (anywhere among the table definitions; `uniqueIndex`, `uuid`, `text`, `timestamp` are already imported at the top of this file):

```ts
// Runtime-grantable admin access. One row per Clerk user who has requested or
// been granted admin. status: "pending" (requested, awaiting a decision) |
// "approved" (is an admin) | "denied" (declined; may request again). Keyed on
// clerk_user_id — the authenticated identity, so a grant can't be spoofed.
// role_id (Phase 2) will FK into admin_roles; omitted here on purpose.
export const adminAccess = pgTable(
  "admin_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByEmail: text("decided_by_email"),
  },
  (t) => ({
    clerkUserIdUnique: uniqueIndex("admin_access_clerk_user_id_unique").on(t.clerkUserId),
  }),
);
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit writes a new `drizzle/0009_*.sql` containing `CREATE TABLE "admin_access"` + the unique index, plus `drizzle/meta/0009_snapshot.json`. (It must NOT print "No schema changes".)

- [ ] **Step 3: Apply to the dev Neon DB**

Run: `pnpm db:push`
Expected: drizzle-kit reports creating `admin_access` and applies it without prompting (additive change). Verify it landed:

Run: `pnpm tsx --require dotenv/config -e "import('@/db').then(async ({db})=>{const {sql}=await import('drizzle-orm');const r=await db.execute(sql\`select to_regclass('public.admin_access') as t\`);console.log(r.rows ?? r);})" 2>/dev/null || node -e "console.log('use db:studio to confirm')"`
Expected: a non-null `admin_access` regclass (table exists). If the inline check is awkward in this repo's tsx setup, confirm via `pnpm db:studio` instead.

- [ ] **Step 4: Update the PRD log**

Prepend a new entry to the top of `PRD/events-v1.md` (newest first), summarizing: "Admin RBAC Phase 1 — added `admin_access` table (migration 0009), pushed to dev DB." Use the format in `CLAUDE.md`.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/ PRD/events-v1.md
git commit -m "feat(admin): admin_access table for runtime admin grants (RBAC phase 1)"
```
Expected: pre-commit drift guard runs `drizzle-kit generate`, prints "No schema changes" (migration already committed), and the commit succeeds.

---

### Task 2: `admin-access.ts` DB helpers (TDD)

**Files:**
- Create: `src/lib/admin-access.ts`
- Test: `tests/lib/admin-access.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin-access.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  requestAdminAccess,
  getAdminAccessStatus,
  isApprovedAdmin,
  decideAdminAccess,
} from "@/lib/admin-access";

// Each test uses a unique clerk id so rows never collide with real data or
// each other; cleanup removes them.
const ids: string[] = [];
function freshId(): string {
  const id = `test_${crypto.randomUUID()}`;
  ids.push(id);
  return id;
}

afterEach(async () => {
  for (const id of ids.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("admin-access helpers", () => {
  it("requestAdminAccess inserts a pending row; status reads back pending", async () => {
    const clerkUserId = freshId();
    const status = await requestAdminAccess({
      clerkUserId, email: "x@test.dev", name: "X Test", imageUrl: null,
    });
    expect(status).toBe("pending");
    expect(await getAdminAccessStatus(clerkUserId)).toBe("pending");
    expect(await isApprovedAdmin(clerkUserId)).toBe(false);
  });

  it("getAdminAccessStatus is 'none' for an unknown user", async () => {
    expect(await getAdminAccessStatus(`test_${crypto.randomUUID()}`)).toBe("none");
  });

  it("decideAdminAccess approves a row; isApprovedAdmin becomes true", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "a@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    const updated = await decideAdminAccess({ id: row.id, decision: "approved", decidedByEmail: "boss@test.dev" });
    expect(updated?.status).toBe("approved");
    expect(updated?.decidedByEmail).toBe("boss@test.dev");
    expect(updated?.decidedAt).not.toBeNull();
    expect(await isApprovedAdmin(clerkUserId)).toBe(true);
  });

  it("re-requesting after denial flips back to pending and clears the decision", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "b@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    await decideAdminAccess({ id: row.id, decision: "denied", decidedByEmail: "boss@test.dev" });
    expect(await getAdminAccessStatus(clerkUserId)).toBe("denied");

    const status = await requestAdminAccess({ clerkUserId, email: "b@test.dev", name: null, imageUrl: null });
    expect(status).toBe("pending");
    const [after] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(after.status).toBe("pending");
    expect(after.decidedAt).toBeNull();
    expect(after.decidedByEmail).toBeNull();
  });

  it("requesting when already approved is a no-op (stays approved)", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "c@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    await decideAdminAccess({ id: row.id, decision: "approved", decidedByEmail: "boss@test.dev" });
    const status = await requestAdminAccess({ clerkUserId, email: "c@test.dev", name: null, imageUrl: null });
    expect(status).toBe("approved");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/admin-access.test.ts`
Expected: FAIL — cannot resolve `@/lib/admin-access` (module not created yet).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/admin-access.ts`:

```ts
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";

export type AdminAccessStatus = "none" | "pending" | "approved" | "denied";
export type AdminAccessRow = typeof adminAccess.$inferSelect;

// Current access status for one Clerk user. "none" when there's no row.
export async function getAdminAccessStatus(clerkUserId: string): Promise<AdminAccessStatus> {
  const [row] = await db
    .select({ status: adminAccess.status })
    .from(adminAccess)
    .where(eq(adminAccess.clerkUserId, clerkUserId))
    .limit(1);
  if (!row) return "none";
  return row.status as AdminAccessStatus;
}

export async function isApprovedAdmin(clerkUserId: string): Promise<boolean> {
  return (await getAdminAccessStatus(clerkUserId)) === "approved";
}

export type RequestInput = {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
};

// Upsert the caller's OWN row to pending. New request → insert. Re-request after
// a denial → flip back to pending and clear the prior decision. Already pending
// or approved → no-op (returns the existing status). Returns the resulting status.
export async function requestAdminAccess(input: RequestInput): Promise<AdminAccessStatus> {
  const existing = await getAdminAccessStatus(input.clerkUserId);
  if (existing === "approved" || existing === "pending") return existing;
  if (existing === "denied") {
    await db
      .update(adminAccess)
      .set({
        status: "pending",
        requestedAt: new Date(),
        decidedAt: null,
        decidedByEmail: null,
        email: input.email,
        name: input.name,
        imageUrl: input.imageUrl,
      })
      .where(eq(adminAccess.clerkUserId, input.clerkUserId));
    return "pending";
  }
  await db.insert(adminAccess).values({
    clerkUserId: input.clerkUserId,
    email: input.email,
    name: input.name,
    imageUrl: input.imageUrl,
    status: "pending",
  });
  return "pending";
}

// All rows, pending first, then most-recently-requested. For the /admin/users list.
export async function listAdminAccess(): Promise<AdminAccessRow[]> {
  return db
    .select()
    .from(adminAccess)
    .orderBy(
      asc(sql`case when ${adminAccess.status} = 'pending' then 0 else 1 end`),
      desc(adminAccess.requestedAt),
    );
}

// Approve or deny one row by id. Returns the updated row, or null if id unknown.
export async function decideAdminAccess(args: {
  id: string;
  decision: "approved" | "denied";
  decidedByEmail: string | null;
}): Promise<AdminAccessRow | null> {
  const [row] = await db
    .update(adminAccess)
    .set({
      status: args.decision,
      decidedAt: new Date(),
      decidedByEmail: args.decidedByEmail,
    })
    .where(eq(adminAccess.id, args.id))
    .returning();
  return row ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/admin-access.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-access.ts tests/lib/admin-access.test.ts
git commit -m "feat(admin): admin-access DB helpers (request/decide/list)"
```
(No schema.ts in this commit → no drift-guard run. The PRD was already updated in Task 1; if the hook complains that PRD isn't staged, add a one-line entry and re-commit.)

---

### Task 3: extend `admin.ts` — super admins + DB-approved (TDD)

**Files:**
- Modify: `src/lib/admin.ts`
- Test: `tests/lib/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/admin-auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable Clerk user + DB-approval for the unit under test.
let mockUser: unknown = null;
let approved = false;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => mockUser),
}));
vi.mock("@/lib/admin-access", () => ({
  isApprovedAdmin: vi.fn(async () => approved),
}));

import { isAdmin, isSuperAdmin, adminGate } from "@/lib/admin";

function userWith(emails: Array<{ email: string; verified: boolean }>, id = "u_1") {
  return {
    id,
    emailAddresses: emails.map((e) => ({
      emailAddress: e.email,
      verification: { status: e.verified ? "verified" : "unverified" },
    })),
    primaryEmailAddress: { emailAddress: emails[0]?.email },
  };
}

beforeEach(() => {
  mockUser = null;
  approved = false;
  process.env.ADMIN_EMAILS = "boot@test.dev";
});

describe("admin auth", () => {
  it("super admin: verified super-admin email passes isAdmin + isSuperAdmin", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect(await isSuperAdmin()).toBe(true);
    expect(await isAdmin()).toBe(true);
  });

  it("super-admin email that is NOT verified does not pass", async () => {
    mockUser = userWith([{ email: "drodio@gmail.com", verified: false }]);
    expect(await isSuperAdmin()).toBe(false);
    expect(await isAdmin()).toBe(false);
  });

  it("bootstrap ADMIN_EMAILS passes isAdmin but not isSuperAdmin", async () => {
    mockUser = userWith([{ email: "boot@test.dev", verified: true }]);
    expect(await isAdmin()).toBe(true);
    expect(await isSuperAdmin()).toBe(false);
  });

  it("DB-approved user passes isAdmin (not super)", async () => {
    mockUser = userWith([{ email: "nobody@test.dev", verified: true }]);
    approved = true;
    expect(await isAdmin()).toBe(true);
    expect(await isSuperAdmin()).toBe(false);
  });

  it("signed-out → not admin; adminGate returns ok:false with null email", async () => {
    mockUser = null;
    expect(await isAdmin()).toBe(false);
    const gate = await adminGate();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.email).toBeNull();
  });

  it("adminGate returns ok:true for an approved user", async () => {
    mockUser = userWith([{ email: "nobody@test.dev", verified: true }]);
    approved = true;
    expect((await adminGate()).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/admin-auth.test.ts`
Expected: FAIL — `isSuperAdmin` is not exported yet (and DB-approval branch missing).

- [ ] **Step 3: Edit `admin.ts`**

In `src/lib/admin.ts`, add the import near the top (after the existing imports).
Use the `@/lib/...` alias (not a relative path) so the specifier matches what
`tests/lib/admin-auth.test.ts` mocks, guaranteeing the mock is applied:

```ts
import { isApprovedAdmin } from "@/lib/admin-access";
```

Add the super-admin constant + helper just below `verifiedEmails(...)`:

```ts
// Super admins are hardcoded — changing this set requires a code change + PR
// (deliberately NOT env, since env can change without review). Super admins
// bypass every grant/scope check and are the only tier (Phase 1) that sees
// /admin/users and /admin/roles.
export const SUPER_ADMIN_EMAILS = [
  "drodio@chief.bot",
  "drodio@gmail.com",
  "drodio@storytell.ai",
];
function superAdminEmails(): string[] {
  return SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
}

export async function isSuperAdmin(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  if (!user) return false;
  return verifiedEmails(user).some((e) => superAdminEmails().includes(e));
}
```

Replace the body of `isAdmin()` with:

```ts
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  if (!user) return false;
  const verified = verifiedEmails(user);
  // 1) super admin (hardcoded) 2) bootstrap env allowlist 3) DB-approved row.
  if (verified.some((e) => superAdminEmails().includes(e))) return true;
  const allow = adminEmails();
  if (allow.length > 0 && verified.some((e) => allow.includes(e))) return true;
  return isApprovedAdmin(user.id);
}
```

Replace the body of `adminGate()` with (keeps the existing `{ok:true} | {ok:false; email}` contract used by pages):

```ts
export async function adminGate(): Promise<
  { ok: true } | { ok: false; email: string | null }
> {
  const user = await currentUser().catch(() => null);
  if (user) {
    const verified = verifiedEmails(user);
    const allow = adminEmails();
    const ok =
      verified.some((e) => superAdminEmails().includes(e)) ||
      (allow.length > 0 && verified.some((e) => allow.includes(e))) ||
      (await isApprovedAdmin(user.id));
    if (ok) return { ok: true };
  }
  return {
    ok: false,
    email:
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null,
  };
}
```

(Leave `requireAdmin()` as-is — it calls the now-extended `isAdmin()`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/admin-auth.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin.ts tests/lib/admin-auth.test.ts
git commit -m "feat(admin): super-admin tier + DB-approved admins in isAdmin/adminGate"
```

---

### Task 4: `POST /api/admin/access/request` (TDD)

**Files:**
- Create: `src/app/api/admin/access/request/route.ts`
- Test: `tests/app/admin-access-request.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/admin-access-request.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";

let mockUserId: string | null = "u_req_1";
let mockIsAdmin = false;

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
  currentUser: vi.fn(async () => ({
    id: mockUserId,
    fullName: "Req Tester",
    imageUrl: "https://img.test/x.png",
    primaryEmailAddress: { emailAddress: "req@test.dev" },
    emailAddresses: [{ emailAddress: "req@test.dev" }],
  })),
}));
vi.mock("@/lib/admin", () => ({ isAdmin: vi.fn(async () => mockIsAdmin) }));

import { POST } from "@/app/api/admin/access/request/route";

const cleanupIds: string[] = [];
beforeEach(() => {
  mockUserId = `u_req_${crypto.randomUUID()}`;
  cleanupIds.push(mockUserId);
  mockIsAdmin = false;
});
afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("POST /api/admin/access/request", () => {
  it("creates a pending row for the signed-in caller", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");

    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, mockUserId!));
    expect(row.status).toBe("pending");
    expect(row.email).toBe("req@test.dev");
    expect(row.name).toBe("Req Tester");
  });

  it("401 when not signed in", async () => {
    mockUserId = null;
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("no-op (status approved) when caller is already an admin", async () => {
    mockIsAdmin = true;
    const res = await POST();
    expect((await res.json()).status).toBe("approved");
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, mockUserId!));
    expect(rows.length).toBe(0); // nothing written
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/admin-access-request.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/access/request/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdmin } from "@/lib/admin";
import { requestAdminAccess } from "@/lib/admin-access";

export const runtime = "nodejs";

// A signed-in, non-admin user requests admin access. Touches ONLY the caller's
// own row (keyed on their Clerk user id) — there is no way to request on behalf
// of anyone else, so this needs no admin gate. Already-admins are a no-op.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (await isAdmin()) {
    return NextResponse.json({ status: "approved" });
  }
  const user = await currentUser().catch(() => null);
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const status = await requestAdminAccess({
    clerkUserId: userId,
    email,
    name: user?.fullName ?? null,
    imageUrl: user?.imageUrl ?? null,
  });
  return NextResponse.json({ status });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/admin-access-request.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/access/request/route.ts tests/app/admin-access-request.test.ts
git commit -m "feat(admin): POST /api/admin/access/request"
```

---

### Task 5: `POST /api/admin/access/[id]/decision` (TDD)

**Files:**
- Create: `src/app/api/admin/access/[id]/decision/route.ts`
- Test: `tests/app/admin-access-decision.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/app/admin-access-decision.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";

let mockIsSuper = true;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "boss@test.dev" },
    emailAddresses: [{ emailAddress: "boss@test.dev" }],
  })),
}));
vi.mock("@/lib/admin", () => ({ isSuperAdmin: vi.fn(async () => mockIsSuper) }));

import { POST } from "@/app/api/admin/access/[id]/decision/route";

const cleanupIds: string[] = [];
async function seedPending(): Promise<string> {
  const clerkUserId = `u_dec_${crypto.randomUUID()}`;
  cleanupIds.push(clerkUserId);
  const [row] = await db
    .insert(adminAccess)
    .values({ clerkUserId, email: "p@test.dev", status: "pending" })
    .returning();
  return row.id;
}
function post(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/admin/access/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => { mockIsSuper = true; });
afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("POST /api/admin/access/[id]/decision", () => {
  it("approves a pending row (records decidedByEmail + decidedAt)", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "approved" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("approved");
    expect(row.decidedByEmail).toBe("boss@test.dev");
    expect(row.decidedAt).not.toBeNull();
  });

  it("denies a pending row", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "denied" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("denied");
  });

  it("403 when caller is not a super admin (and does not change the row)", async () => {
    const id = await seedPending();
    mockIsSuper = false;
    const res = await post(id, { decision: "approved" });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("pending");
  });

  it("400 on an invalid decision", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "maybe" });
    expect(res.status).toBe(400);
  });

  it("400 on a non-uuid id", async () => {
    const res = await post("not-a-uuid", { decision: "approved" });
    expect(res.status).toBe(400);
  });

  it("404 when the id is unknown", async () => {
    const res = await post(crypto.randomUUID(), { decision: "approved" });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/app/admin-access-decision.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/access/[id]/decision/route.ts`:

```ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import { decideAdminAccess } from "@/lib/admin-access";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

type Body = { decision?: string };

// Approve or deny an admin-access request. SECURITY: super-admin-only in Phase 1
// (Phase 2 will also accept an `approve_admin_requests` grant). The gate is
// server-side; the UI buttons are convenience only.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.decision !== "approved" && body.decision !== "denied") {
    return NextResponse.json({ error: "invalid decision" }, { status: 400 });
  }
  const user = await currentUser().catch(() => null);
  const decidedByEmail =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const row = await decideAdminAccess({ id, decision: body.decision, decidedByEmail });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: row.status });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/app/admin-access-decision.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/access/[id]/decision/route.ts" tests/app/admin-access-decision.test.ts
git commit -m "feat(admin): POST /api/admin/access/[id]/decision (super-admin gated)"
```

---

### Task 6: `AdminAccessGate` client component

**Files:**
- Create: `src/components/admin/AdminAccessGate.tsx`

No automated test (pure presentational client component, consistent with the codebase's other client components like `DeveloperConsole`); verified manually in Task 9.

- [ ] **Step 1: Create the component**

Create `src/components/admin/AdminAccessGate.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";

type Status = "none" | "pending" | "denied";

// Shown by the admin layout to anyone who is not (yet) an admin. Signed out →
// Clerk sign-in (no profile claim, mirrors /developers). Signed in → a Request
// Admin Status button, or the current request status.
export function AdminAccessGate({
  signedIn,
  email,
  status,
}: {
  signedIn: boolean;
  email: string | null;
  status: Status;
}) {
  const clerk = useClerk();
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState<Status>(status);
  const [error, setError] = useState<string | null>(null);

  async function requestAccess() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access/request", { method: "POST" });
      if (!res.ok) {
        setError("Could not submit your request. Please try again.");
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { status?: Status };
      setLocalStatus(json.status ?? "pending");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md flex flex-col items-center text-center gap-6 rounded-xl border border-zinc-800 bg-zinc-950 p-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/founder-festival-logo.png"
        alt="Founder Festival"
        width={498}
        height={444}
        className="w-[56px] h-auto"
      />
      <h1 className="font-display text-2xl font-bold tracking-tight">Admin</h1>

      {!signedIn && (
        <>
          <p className="text-zinc-400 text-sm">Sign in to access the admin area.</p>
          <button
            type="button"
            onClick={() =>
              clerk.openSignIn({
                forceRedirectUrl: "/admin",
                signUpForceRedirectUrl: "/admin",
              })
            }
            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors"
          >
            Sign in
          </button>
        </>
      )}

      {signedIn && localStatus === "none" && (
        <>
          <p className="text-zinc-400 text-sm">
            Signed in as <span className="text-zinc-200">{email}</span>, but this
            account isn&apos;t an admin yet.
          </p>
          <button
            type="button"
            disabled={submitting}
            onClick={requestAccess}
            className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-8 py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Requesting…" : "Request Admin Status"}
          </button>
        </>
      )}

      {signedIn && localStatus === "pending" && (
        <p className="text-sm text-amber-400">
          Your request is pending review. You&apos;ll get access once an admin
          approves it.
        </p>
      )}

      {signedIn && localStatus === "denied" && (
        <>
          <p className="text-sm text-zinc-400">Your request was declined.</p>
          <button
            type="button"
            disabled={submitting}
            onClick={requestAccess}
            className="rounded-md border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-medium px-6 py-2.5 text-sm transition-colors disabled:opacity-40"
          >
            {submitting ? "Requesting…" : "Request again"}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file. (Cannot render-test without a browser; covered in Task 9 smoke.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AdminAccessGate.tsx
git commit -m "feat(admin): AdminAccessGate (sign-in + request access)"
```

---

### Task 7: rewire `admin/layout.tsx` to gate instead of redirect

**Files:**
- Modify: `src/app/(authed)/admin/layout.tsx`

- [ ] **Step 1: Replace the layout**

Replace the entire contents of `src/app/(authed)/admin/layout.tsx` with:

```tsx
import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { isAdmin, isSuperAdmin } from "@/lib/admin";
import { getAdminAccessStatus, type AdminAccessStatus } from "@/lib/admin-access";
import { AdminAccessGate } from "@/components/admin/AdminAccessGate";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser().catch(() => null);
  const admin = await isAdmin();

  // Not an admin → render the sign-in / request-access gate instead of bouncing
  // home, so a user can log in (no profile claim) and ask for access right here.
  if (!admin) {
    const dbStatus: AdminAccessStatus = user
      ? await getAdminAccessStatus(user.id)
      : "none";
    // The gate only ever shows none/pending/denied (approved users are admins).
    const gateStatus = dbStatus === "approved" ? "none" : dbStatus;
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null;
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-[#151515] text-zinc-100 px-6 py-16">
        <AdminAccessGate signedIn={!!user} email={email} status={gateStatus} />
      </div>
    );
  }

  const superAdmin = await isSuperAdmin();
  const host = (await headers()).get("host") ?? "";
  const envLabel =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "DEV" : "PROD";
  const envColor = envLabel === "PROD" ? "#dfa43a" : "#3a8fdf";

  return (
    <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/admin" className="font-display text-xl font-bold tracking-tight">
            admin
          </a>
          <nav className="flex gap-4 text-sm text-zinc-400">
            <a href="/admin/score" className="hover:text-white">Score</a>
            <a href="/admin/events" className="hover:text-white">Events</a>
            <a href="/admin/pending" className="hover:text-white">Pending items</a>
            {superAdmin && (
              <a href="/admin/users" className="hover:text-white">Users</a>
            )}
            <a href="/?home=1" className="hover:text-white">← Back to site</a>
          </nav>
        </div>
        <span
          className="text-xs font-mono uppercase tracking-[0.2em] px-2 py-1 rounded border"
          style={{ color: envColor, borderColor: envColor }}
          title={host}
        >
          {envLabel}
        </span>
      </header>
      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(authed)/admin/layout.tsx"
git commit -m "feat(admin): gate non-admins with AdminAccessGate; super-admin Users nav"
```

---

### Task 8: `/admin/users` page + `AdminAccessTable`

**Files:**
- Create: `src/app/(authed)/admin/users/page.tsx`
- Create: `src/components/admin/AdminAccessTable.tsx`

- [ ] **Step 1: Create the client table component**

Create `src/components/admin/AdminAccessTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AccessRow = {
  id: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  status: string;
  requestedAt: string;
  decidedByEmail: string | null;
};

// Lists admin-access rows; pending rows get Approve/Deny buttons that hit the
// super-admin-gated decision route, then refresh the server component.
export function AdminAccessTable({ rows }: { rows: AccessRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "denied") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/access/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `Action failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500 text-sm">No access requests yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="border border-zinc-800 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">
                  <div className="text-zinc-100">{r.name ?? "—"}</div>
                  <div className="text-zinc-500 text-xs">{r.email ?? "—"}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                  {r.decidedByEmail && (
                    <span className="block text-[10px] text-zinc-600 mt-0.5">
                      by {r.decidedByEmail}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" ? (
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "approved")}
                        className="rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "denied")}
                        className="rounded-md border border-zinc-700 hover:border-red-700 text-zinc-300 hover:text-red-300 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
                      >
                        Deny
                      </button>
                    </div>
                  ) : (
                    <span className="text-zinc-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "approved"
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : status === "denied"
        ? "text-red-400 border-red-400/30 bg-red-400/10"
        : "text-amber-400 border-amber-400/30 bg-amber-400/10";
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs ${color}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/app/(authed)/admin/users/page.tsx`:

```tsx
import { currentUser } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listAdminAccess } from "@/lib/admin-access";
import { AdminAccessTable } from "@/components/admin/AdminAccessTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Phase 1: super-admin only. (Phase 2: also the approve_admin_requests grant.)
  if (!(await isSuperAdmin())) {
    const user = await currentUser().catch(() => null);
    const email =
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null;
    return <NotAuthorized email={email} />;
  }

  const rows = await listAdminAccess();
  // Map to a serializable shape for the client component (Date → ISO string).
  const serialized = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    imageUrl: r.imageUrl,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    decidedByEmail: r.decidedByEmail,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <a href="/admin" className="link text-sm">← Admin home</a>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Users &amp; access</h1>
      <p className="text-zinc-400 text-sm -mt-2">
        Approve or deny requests for admin access.
      </p>
      <AdminAccessTable rows={serialized} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authed)/admin/users/page.tsx" src/components/admin/AdminAccessTable.tsx
git commit -m "feat(admin): /admin/users page with approve/deny (super-admin only)"
```

---

### Task 9: Full verification + manual smoke + PRD

**Files:**
- Modify: `PRD/events-v1.md`

- [ ] **Step 1: Type-check + lint + full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run tests/lib/admin-access.test.ts tests/lib/admin-auth.test.ts tests/app/admin-access-request.test.ts tests/app/admin-access-decision.test.ts`
Expected: tsc clean, lint clean, all four test files pass. (The full `pnpm test` may show pre-existing Neon-cold-start flakiness unrelated to this work — re-run a failing file in isolation to confirm.)

- [ ] **Step 2: Manual smoke on localhost (port 3002)**

With the dev server running on :3002, verify:
1. **Signed out** → visit `/admin`: see the gate with a **Sign in** button (no profile-claim flow). Signing in returns you to `/admin`.
2. **Signed in as a non-admin** (any account NOT in `SUPER_ADMIN_EMAILS`/`ADMIN_EMAILS` and not approved) → `/admin` shows "Request Admin Status"; clicking it flips to "pending".
3. **Signed in as `drodio@storytell.ai`** (super admin) → `/admin` shows the hub + a **Users** nav link; `/admin/users` lists the pending request; **Approve** moves it to approved.
4. The just-approved account (re-load `/admin`) now sees the full admin hub.
5. **Deny** path: deny a pending request; that account sees "Your request was declined" + "Request again", which returns it to pending.

- [ ] **Step 3: Update the PRD log**

Prepend a new entry to `PRD/events-v1.md` summarizing Phase 1 completion (sign-in-from-/admin, request flow, super-admin `/admin/users` approve/deny, `admin_access` table 0009) and noting the prod handoff in Step 4.

- [ ] **Step 4: Note the production migration handoff**

`admin_access` (migration 0009) must be applied to the **production** Neon Primary branch before this ships (prod has no auto-migrate per project memory). The operator runs the migration on prod when ready; all changes are additive and safe. Surface this explicitly in the final report — do not attempt to touch prod credentials directly.

- [ ] **Step 5: Commit**

```bash
git add PRD/events-v1.md
git commit -m "docs(admin): RBAC Phase 1 complete — PRD update + prod migration note"
```

---

## Self-review notes

- **Spec coverage (Phase 1 slice):** sign-in-from-/admin (Task 6/7) ✓; Request Admin Status (Task 4/6) ✓; super-admin tier incl. storytell.ai (Task 3) ✓; `admin_access` table (Task 1) ✓; `/admin/users` approve/deny super-admin-only (Task 5/8) ✓; deny reversible (Task 2 re-request + Task 6 UI) ✓; `isAdmin` accepts super/bootstrap/approved (Task 3) ✓; bootstrap `ADMIN_EMAILS` retained (Task 3) ✓. Phase 2 items (roles, grants, scopes, grant-gated pages, role-at-approval) are intentionally out of this plan.
- **Type consistency:** `AdminAccessStatus` ("none"|"pending"|"approved"|"denied") defined in Task 2 and reused in Task 7; the gate's `Status` is the none/pending/denied subset (Task 6). `decideAdminAccess({id, decision, decidedByEmail})` signature matches its calls in Tasks 5/8 tests. Route handler signature `(req, ctx: { params: Promise<{id}> })` matches the Next 16 pattern and the Task 5 test's `post()` helper.
- **No placeholders:** every code/test step contains complete code; commands have expected output.
```
