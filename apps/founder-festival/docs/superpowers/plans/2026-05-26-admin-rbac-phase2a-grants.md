# Admin RBAC Phase 2a — Roles & Grants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super-admins define named roles with a set of grants, assign a role when approving an admin, and have those grants gate every admin action (scoring jobs, event create/manage/delete, role management, approving requests) — server-side and in the UI.

**Architecture:** New `admin_roles` table (name, scope, grants[]) + `admin_access.role_id`. A `can(grant)` resolver: super-admins and env-bootstrap admins get ALL grants; an approved admin with a role gets that role's grants; an approved admin with NO role keeps ALL grants (backward-compatible, so existing approved admins don't lose access — no prod data-seed needed). API routes swap their `isAdmin()` checks for `requireGrant(<grant>)`; UI hides controls via `can(<grant>)`.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (neon-http), Clerk, Vitest (tests hit the shared dev Neon DB).

**Spec:** `docs/superpowers/specs/2026-05-26-admin-rbac-design.md` (Phase 2; open questions resolved; **scope (theirs/all) is Phase 2b, NOT in this plan** — the `scope` column exists defaulting to `edit_all` but is neither editable nor enforced here).

---

## File structure

- **Modify** `src/db/schema.ts` — add `adminRoles` table + `adminAccess.roleId`.
- **Create** `drizzle/0014_*.sql` (+ snapshot) — generated migration.
- **Create** `src/lib/grants.ts` — `GRANTS` catalog + `Grant` type; `getViewerGrants()`, `can(grant)`, `requireGrant(grant)`.
- **Create** `src/lib/admin-roles.ts` — role CRUD: `listRoles`, `getRole`, `createRole`, `updateRole`, `deleteRole` (blocks if assigned), `roleAssigneeCount`, `getRoleForClerkUser`.
- **Modify** `src/lib/admin-access.ts` — `decideAdminAccess` accepts optional `roleId`; `assignRole(id, roleId)`.
- **Create** `src/app/api/admin/roles/route.ts` (POST) + `src/app/api/admin/roles/[id]/route.ts` (PATCH, DELETE).
- **Modify** existing admin API routes — replace `isAdmin()`/`isSuperAdmin()` gates with `requireGrant(...)`.
- **Create** `src/app/(authed)/admin/roles/page.tsx` + `src/components/admin/RolesManager.tsx`.
- **Modify** `src/app/(authed)/admin/access/page.tsx` + `src/components/admin/AdminAccessTable.tsx` — role dropdown at approval.
- **Modify** `src/app/(authed)/admin/layout.tsx` (nav: Roles link), `src/app/(authed)/admin/score/page.tsx`, `src/app/(authed)/admin/events/page.tsx` — gate action controls by grant.
- **Tests:** `tests/lib/grants.test.ts`, `tests/lib/admin-roles.test.ts`, `tests/app/admin-roles-route.test.ts`.

Tests run against the live dev Neon DB; seed with random ids, clean up in `afterEach`.

---

### Task 1: `admin_roles` table + `admin_access.role_id` + migration 0014

**Files:** Modify `src/db/schema.ts`; create `drizzle/0014_*.sql`; modify `PRD/events-v1.md`.

- [ ] **Step 1: Add the table + column**

In `src/db/schema.ts`, add (after the `adminAccess` table):

```ts
// Named RBAC roles a super-admin defines. `grants` is an array of grant keys
// (see src/lib/grants.ts). `scope` exists for Phase 2b (view/edit theirs-vs-all)
// and is NOT enforced yet — defaults to "edit_all" (full visibility).
export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("edit_all"),
  grants: jsonb("grants").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  nameUnique: uniqueIndex("admin_roles_name_unique").on(t.name),
}));
```

Then add a `roleId` column to the existing `adminAccess` table definition (after `decidedByEmail`):

```ts
    // Phase 2: the role assigned when this user was approved (null = full admin,
    // backward-compatible for rows approved before roles existed).
    roleId: uuid("role_id").references((): AnyPgColumn => adminRoles.id),
```

(`AnyPgColumn` is already imported; `sql` is already imported.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: `drizzle/0014_*.sql` creating `admin_roles` + adding `admin_access.role_id` + the unique index. Must NOT say "No schema changes". Note the filename.

- [ ] **Step 3: Apply to the dev Neon DB (db:push needs a TTY — apply SQL directly)**

Run (single line):
`DOTENV_CONFIG_PATH=.env.local pnpm tsx --require dotenv/config -e "import('@neondatabase/serverless').then(async({neon})=>{const sql=neon(process.env.DATABASE_URL);await sql\`CREATE TABLE IF NOT EXISTS admin_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL, scope text NOT NULL DEFAULT 'edit_all', grants jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())\`;await sql\`CREATE UNIQUE INDEX IF NOT EXISTS admin_roles_name_unique ON admin_roles (name)\`;await sql\`ALTER TABLE admin_access ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES admin_roles(id)\`;const r=await sql\`select to_regclass('public.admin_roles') as t\`;console.log(JSON.stringify(r));process.exit(0)})"`
Expected: prints a non-null `admin_roles`. (Use `@neondatabase/serverless` directly — it's the reliable headless path; confirmed working for migration 0013.)

- [ ] **Step 4: PRD entry + commit**

Prepend a `PRD/events-v1.md` entry (RBAC Phase 2a — admin_roles + admin_access.role_id, migration 0014, dev applied). Then:
```bash
git add src/db/schema.ts drizzle/ PRD/events-v1.md
git commit -m "feat(rbac): admin_roles table + admin_access.role_id (Phase 2a) — migration 0014"
```
Expected: drift guard prints "No schema changes"; commit succeeds. No `--no-verify`.

---

### Task 2: grants catalog + capability resolver (`src/lib/grants.ts`) — TDD

**Files:** Create `src/lib/grants.ts`; create `src/lib/admin-roles.ts` (the `getRoleForClerkUser` helper used here); Test `tests/lib/grants.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/grants.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockUser: unknown = null;
let approvedRoleGrants: string[] | null = null; // null = no approved row; [] = approved no-role handled separately
let approvedNoRole = false;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => mockUser),
}));
// getRoleForClerkUser returns { roleId, grants } | "no-role" | null
vi.mock("@/lib/admin-roles", () => ({
  getRoleForClerkUser: vi.fn(async () => {
    if (approvedNoRole) return { grants: null as string[] | null };
    if (approvedRoleGrants) return { grants: approvedRoleGrants };
    return null;
  }),
}));

import { can, getViewerGrants, GRANTS } from "@/lib/grants";

function userWith(emails: Array<{ email: string; verified: boolean }>, id = "u_g") {
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
  approvedRoleGrants = null;
  approvedNoRole = false;
  process.env.ADMIN_EMAILS = "boot@test.dev";
});

describe("grants", () => {
  it("GRANTS catalog has the 7 documented keys", () => {
    expect(GRANTS.map((g) => g.key).sort()).toEqual(
      [
        "approve_admin_requests",
        "create_events",
        "create_roles",
        "delete_events",
        "edit_roles",
        "manage_events",
        "run_scoring_jobs",
      ].sort(),
    );
  });

  it("super admin gets every grant", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect((await getViewerGrants()).length).toBe(GRANTS.length);
    expect(await can("run_scoring_jobs")).toBe(true);
    expect(await can("create_roles")).toBe(true);
  });

  it("bootstrap env admin gets every grant", async () => {
    mockUser = userWith([{ email: "boot@test.dev", verified: true }]);
    expect(await can("delete_events")).toBe(true);
  });

  it("approved admin with a role gets exactly that role's grants", async () => {
    mockUser = userWith([{ email: "vendor@test.dev", verified: true }]);
    approvedRoleGrants = ["create_events", "manage_events"];
    expect(await can("create_events")).toBe(true);
    expect(await can("manage_events")).toBe(true);
    expect(await can("delete_events")).toBe(false);
    expect(await can("run_scoring_jobs")).toBe(false);
    expect((await getViewerGrants()).sort()).toEqual(["create_events", "manage_events"]);
  });

  it("approved admin with NO role keeps all grants (backward-compatible)", async () => {
    mockUser = userWith([{ email: "legacy@test.dev", verified: true }]);
    approvedNoRole = true;
    expect(await can("run_scoring_jobs")).toBe(true);
    expect((await getViewerGrants()).length).toBe(GRANTS.length);
  });

  it("signed-out user has no grants", async () => {
    mockUser = null;
    expect(await can("create_events")).toBe(false);
    expect(await getViewerGrants()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/grants.test.ts`
Expected: FAIL — `@/lib/grants` (and `@/lib/admin-roles`) not found.

- [ ] **Step 3: Create `src/lib/admin-roles.ts` (minimum needed by grants.ts here; full CRUD in Task 4 — define the whole file now)**

Create `src/lib/admin-roles.ts`:

```ts
import { db } from "@/db";
import { adminRoles, adminAccess } from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";

export type AdminRoleRow = typeof adminRoles.$inferSelect;

// The approved admin's role membership: { grants } where grants is the role's
// grant list, or null when approved but role-less (→ treated as full admin).
// Returns null when the user has no approved admin_access row.
export async function getRoleForClerkUser(
  clerkUserId: string,
): Promise<{ grants: string[] | null } | null> {
  const [row] = await db
    .select({ status: adminAccess.status, roleId: adminAccess.roleId, grants: adminRoles.grants })
    .from(adminAccess)
    .leftJoin(adminRoles, eq(adminAccess.roleId, adminRoles.id))
    .where(eq(adminAccess.clerkUserId, clerkUserId))
    .limit(1);
  if (!row || row.status !== "approved") return null;
  // roleId null → approved but no role → full admin (grants: null sentinel).
  return { grants: row.roleId ? (row.grants ?? []) : null };
}

export async function listRoles(): Promise<AdminRoleRow[]> {
  return db.select().from(adminRoles).orderBy(desc(adminRoles.createdAt));
}

export async function getRole(id: string): Promise<AdminRoleRow | null> {
  const [row] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  return row ?? null;
}

export async function createRole(input: { name: string; grants: string[] }): Promise<AdminRoleRow> {
  const [row] = await db
    .insert(adminRoles)
    .values({ name: input.name, grants: input.grants })
    .returning();
  return row!;
}

export async function updateRole(
  id: string,
  patch: { name?: string; grants?: string[] },
): Promise<AdminRoleRow | null> {
  const [row] = await db
    .update(adminRoles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(adminRoles.id, id))
    .returning();
  return row ?? null;
}

// Number of admins currently assigned this role.
export async function roleAssigneeCount(id: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(adminAccess)
    .where(eq(adminAccess.roleId, id));
  return Number(row?.n ?? 0);
}

// Delete a role. Blocked (returns "in_use") if any admin still has it — the
// caller must reassign those admins first. Returns "deleted" | "in_use" | "not_found".
export async function deleteRole(id: string): Promise<"deleted" | "in_use" | "not_found"> {
  if ((await roleAssigneeCount(id)) > 0) return "in_use";
  const deleted = await db.delete(adminRoles).where(eq(adminRoles.id, id)).returning({ id: adminRoles.id });
  return deleted.length > 0 ? "deleted" : "not_found";
}
```

- [ ] **Step 4: Create `src/lib/grants.ts`**

```ts
import { currentUser } from "@clerk/nextjs/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin";
import { getRoleForClerkUser } from "@/lib/admin-roles";

export type Grant =
  | "run_scoring_jobs"
  | "create_events"
  | "manage_events"
  | "delete_events"
  | "create_roles"
  | "edit_roles"
  | "approve_admin_requests";

// The catalog the role editor renders. Order = display order.
export const GRANTS: { key: Grant; label: string }[] = [
  { key: "run_scoring_jobs", label: "Run jobs to score users" },
  { key: "create_events", label: "Create events" },
  { key: "manage_events", label: "Manage events" },
  { key: "delete_events", label: "Delete events" },
  { key: "create_roles", label: "Create roles" },
  { key: "edit_roles", label: "Edit roles" },
  { key: "approve_admin_requests", label: "Approve / deny admin requests" },
];

const ALL_GRANTS: Grant[] = GRANTS.map((g) => g.key);

function verifiedEmails(user: Awaited<ReturnType<typeof currentUser>>): string[] {
  return (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
}

function envAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// The current viewer's effective grants. Super-admins and env-bootstrap admins
// get ALL grants. An approved admin with a role gets that role's grants; an
// approved admin with no role gets ALL grants (backward-compatible). Everyone
// else gets none.
export async function getViewerGrants(): Promise<Grant[]> {
  const user = await currentUser().catch(() => null);
  if (!user) return [];
  const verified = verifiedEmails(user);
  const supers = SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
  if (verified.some((e) => supers.includes(e))) return [...ALL_GRANTS];
  const env = envAdminEmails();
  if (env.length > 0 && verified.some((e) => env.includes(e))) return [...ALL_GRANTS];
  const role = await getRoleForClerkUser(user.id);
  if (!role) return [];
  if (role.grants === null) return [...ALL_GRANTS]; // approved, no role → full admin
  return role.grants.filter((g): g is Grant => (ALL_GRANTS as string[]).includes(g));
}

export async function can(grant: Grant): Promise<boolean> {
  return (await getViewerGrants()).includes(grant);
}

// API-route guard: throws a 403-shaped error when the viewer lacks the grant.
// Mirrors requireAdmin() in src/lib/admin.ts.
export async function requireGrant(grant: Grant): Promise<void> {
  if (!(await can(grant))) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/grants.test.ts`
Expected: PASS (6 tests). Re-run once on a Neon cold-start.

- [ ] **Step 6: tsc + PRD + commit**

Run `pnpm tsc --noEmit` (clean). Prepend a PRD line, then:
```bash
git add src/lib/grants.ts src/lib/admin-roles.ts tests/lib/grants.test.ts PRD/events-v1.md
git commit -m "feat(rbac): grants catalog + can()/requireGrant() resolver + role helpers"
```

---

### Task 3: role CRUD DB tests (lock the `admin-roles.ts` behavior) — TDD

**Files:** Test `tests/lib/admin-roles.test.ts`. (Implementation already written in Task 2; this task adds its tests.)

- [ ] **Step 1: Write the test**

Create `tests/lib/admin-roles.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { adminRoles, adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createRole, updateRole, deleteRole, listRoles, roleAssigneeCount, getRoleForClerkUser,
} from "@/lib/admin-roles";

const roleIds: string[] = [];
const clerkIds: string[] = [];
afterEach(async () => {
  for (const id of clerkIds.splice(0)) await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  for (const id of roleIds.splice(0)) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});
function track(r: { id: string }) { roleIds.push(r.id); return r; }

describe("admin-roles CRUD", () => {
  it("creates, lists, updates a role", async () => {
    const role = track(await createRole({ name: `Vendor ${crypto.randomUUID()}`, grants: ["create_events"] }));
    expect(role.grants).toEqual(["create_events"]);
    const updated = await updateRole(role.id, { grants: ["create_events", "manage_events"] });
    expect(updated?.grants).toEqual(["create_events", "manage_events"]);
    const all = await listRoles();
    expect(all.some((r) => r.id === role.id)).toBe(true);
  });

  it("blocks deletion of a role that is assigned; allows when unassigned", async () => {
    const role = track(await createRole({ name: `Used ${crypto.randomUUID()}`, grants: [] }));
    const clerkUserId = `u_role_${crypto.randomUUID()}`;
    clerkIds.push(clerkUserId);
    await db.insert(adminAccess).values({ clerkUserId, status: "approved", roleId: role.id });

    expect(await roleAssigneeCount(role.id)).toBe(1);
    expect(await deleteRole(role.id)).toBe("in_use");

    // unassign, then delete succeeds
    await db.update(adminAccess).set({ roleId: null }).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(await deleteRole(role.id)).toBe("deleted");
    roleIds.splice(roleIds.indexOf(role.id), 1); // already gone
  });

  it("getRoleForClerkUser returns role grants for an approved+roled user, null sentinel for role-less", async () => {
    const role = track(await createRole({ name: `R ${crypto.randomUUID()}`, grants: ["run_scoring_jobs"] }));
    const roledId = `u_roled_${crypto.randomUUID()}`;
    const rolelessId = `u_roleless_${crypto.randomUUID()}`;
    clerkIds.push(roledId, rolelessId);
    await db.insert(adminAccess).values({ clerkUserId: roledId, status: "approved", roleId: role.id });
    await db.insert(adminAccess).values({ clerkUserId: rolelessId, status: "approved", roleId: null });

    expect((await getRoleForClerkUser(roledId))?.grants).toEqual(["run_scoring_jobs"]);
    expect((await getRoleForClerkUser(rolelessId))?.grants).toBeNull();
    expect(await getRoleForClerkUser(`u_none_${crypto.randomUUID()}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run tests/lib/admin-roles.test.ts`. Expected: PASS (3 tests). If `deleteRole`/`getRoleForClerkUser` behavior diverges, fix `src/lib/admin-roles.ts` (the test is the spec).

- [ ] **Step 3: PRD + commit**
```bash
git add tests/lib/admin-roles.test.ts PRD/events-v1.md
git commit -m "test(rbac): admin-roles CRUD + in-use delete block + role lookup"
```

---

### Task 4: `/admin/roles` API routes — TDD

**Files:** Create `src/app/api/admin/roles/route.ts` (POST) + `src/app/api/admin/roles/[id]/route.ts` (PATCH, DELETE); Test `tests/app/admin-roles-route.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/app/admin-roles-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

let canCreate = true;
let canEdit = true;
vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async (g: string) => {
      const ok = g === "create_roles" ? canCreate : g === "edit_roles" ? canEdit : false;
      if (!ok) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});

import { POST } from "@/app/api/admin/roles/route";
import { PATCH, DELETE } from "@/app/api/admin/roles/[id]/route";

const roleIds: string[] = [];
beforeEach(() => { canCreate = true; canEdit = true; });
afterEach(async () => {
  for (const id of roleIds.splice(0)) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});
function req(body: unknown) {
  return new Request("http://localhost/api/admin/roles", { method: "POST", body: JSON.stringify(body) });
}

describe("admin roles API", () => {
  it("POST creates a role (201) with create_roles grant", async () => {
    const res = await POST(req({ name: `Vendor ${crypto.randomUUID()}`, grants: ["create_events"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    roleIds.push(json.role.id);
    expect(json.role.grants).toEqual(["create_events"]);
  });

  it("POST 403 without create_roles", async () => {
    canCreate = false;
    const res = await POST(req({ name: "X", grants: [] }));
    expect(res.status).toBe(403);
  });

  it("POST 400 on missing name", async () => {
    const res = await POST(req({ grants: [] }));
    expect(res.status).toBe(400);
  });

  it("PATCH updates grants; DELETE removes an unused role", async () => {
    const create = await POST(req({ name: `R ${crypto.randomUUID()}`, grants: [] }));
    const id = (await create.json()).role.id as string;
    roleIds.push(id);

    const patched = await PATCH(
      new Request(`http://localhost/api/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify({ grants: ["manage_events"] }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(patched.status).toBe(200);
    const [row] = await db.select().from(adminRoles).where(eq(adminRoles.id, id));
    expect(row.grants).toEqual(["manage_events"]);

    const del = await DELETE(
      new Request(`http://localhost/api/admin/roles/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(del.status).toBe(200);
    roleIds.splice(roleIds.indexOf(id), 1);
  });
});
```

- [ ] **Step 2: Run it** — `pnpm vitest run tests/app/admin-roles-route.test.ts`. Expected: FAIL (route modules missing).

- [ ] **Step 3: Implement `src/app/api/admin/roles/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { createRole } from "@/lib/admin-roles";

export const runtime = "nodejs";

type Body = { name?: string; grants?: string[] };

export async function POST(req: Request) {
  try {
    await requireGrant("create_roles");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const grants = Array.isArray(body.grants) ? body.grants.filter((g) => typeof g === "string") : [];
  try {
    const role = await createRole({ name, grants });
    return NextResponse.json({ role });
  } catch (e) {
    // Unique-name violation → 409.
    return NextResponse.json({ error: "could not create role (name may be taken)" }, { status: 409 });
  }
}
```

- [ ] **Step 4: Implement `src/app/api/admin/roles/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { updateRole, deleteRole } from "@/lib/admin-roles";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

type Patch = { name?: string; grants?: string[] };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireGrant("edit_roles"); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  let body: Patch;
  try { body = (await req.json()) as Patch; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const patch: { name?: string; grants?: string[] } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body.grants)) patch.grants = body.grants.filter((g) => typeof g === "string");
  const row = await updateRole(id, patch);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ role: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireGrant("edit_roles"); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const result = await deleteRole(id);
  if (result === "in_use") return NextResponse.json({ error: "role is assigned to one or more admins — reassign them first" }, { status: 409 });
  if (result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run it** — `pnpm vitest run tests/app/admin-roles-route.test.ts`. Expected: PASS (4 tests).

- [ ] **Step 6: tsc + PRD + commit**
```bash
git add "src/app/api/admin/roles/route.ts" "src/app/api/admin/roles/[id]/route.ts" tests/app/admin-roles-route.test.ts PRD/events-v1.md
git commit -m "feat(rbac): /api/admin/roles CRUD routes (grant-gated)"
```

---

### Task 5: grant-gate the existing admin API routes

**Files:** Modify `src/app/api/admin/rescore-all/route.ts`, `jobs/route.ts`, `jobs/[id]/route.ts`, `events/route.ts`, `events/[id]/applicants/[applicantId]/route.ts`, `events/[id]/applicants/bulk/route.ts`, `access/[id]/decision/route.ts`.

These currently gate with `isAdmin()` / `isSuperAdmin()`. Replace with the matching grant. Because super-admins and env-bootstrap admins get ALL grants (Task 2), this does NOT change behavior for them — it only narrows role-admins.

- [ ] **Step 1: Apply the grant gate per route**

For each route, import `requireGrant` from `@/lib/grants` and replace the existing `if (!(await isAdmin())) return 403;` block with a try/catch around `requireGrant(<grant>)`. The mapping:

| Route | Grant |
|---|---|
| `rescore-all/route.ts` (POST) | `run_scoring_jobs` |
| `jobs/route.ts` (POST) | `run_scoring_jobs` |
| `jobs/[id]/route.ts` (POST rerun — both gate sites) | `run_scoring_jobs` |
| `events/route.ts` (POST create) | `create_events` |
| `events/[id]/applicants/[applicantId]/route.ts` | `manage_events` |
| `events/[id]/applicants/bulk/route.ts` | `manage_events` |
| `access/[id]/decision/route.ts` (POST) | `approve_admin_requests` (was super-admin-only) |

The exact replacement pattern (example for `rescore-all/route.ts`):

```ts
// at top:
import { requireGrant } from "@/lib/grants";
// replace the isAdmin() guard with:
  try {
    await requireGrant("run_scoring_jobs");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
```

Remove the now-unused `isAdmin`/`isSuperAdmin` import from each route IF it's no longer referenced (leave it if still used elsewhere in the file). Keep `jobs/[id]/route.ts`'s GET (read) on the existing `isAdmin()` — only gate the POST (rerun) with `run_scoring_jobs`; if GET also gates, leave GET on `isAdmin()`.

- [ ] **Step 2: tsc**

Run: `pnpm tsc --noEmit`
Expected: clean (no unused-import or missing-symbol errors).

- [ ] **Step 3: Confirm the existing route tests still pass**

Run: `pnpm vitest run tests/app/rescore-all.test.ts tests/app/admin-access-decision.test.ts`
Expected: `rescore-all.test.ts` mocks `@/lib/admin`'s `isAdmin`; since the route no longer calls `isAdmin`, that test may now fail (it toggled `isAdmin`). UPDATE `tests/app/rescore-all.test.ts`: change its `vi.mock("@/lib/admin", ...)` to instead `vi.mock("@/lib/grants", ...)` exposing `requireGrant` that throws when a `mockAllowed=false` flag is set (mirror the pattern in `tests/app/admin-roles-route.test.ts`). Likewise `admin-access-decision.test.ts` mocked `isSuperAdmin` — update it to mock `requireGrant("approve_admin_requests")`. Make these test updates so both pass. Show the diffs in your report.

- [ ] **Step 4: PRD + commit**
```bash
git add src/app/api/admin tests/app/rescore-all.test.ts tests/app/admin-access-decision.test.ts PRD/events-v1.md
git commit -m "feat(rbac): grant-gate admin API routes (scoring/events/approve)"
```

---

### Task 6: `/admin/access` — assign a role when approving

**Files:** Modify `src/app/api/admin/access/[id]/decision/route.ts`, `src/lib/admin-access.ts`, `src/app/(authed)/admin/access/page.tsx`, `src/components/admin/AdminAccessTable.tsx`.

- [ ] **Step 1: `decideAdminAccess` accepts `roleId`**

In `src/lib/admin-access.ts`, extend `decideAdminAccess`'s args to `{ id, decision, decidedByEmail, roleId? }` and include `roleId: args.roleId ?? null` in the `.set({...})` ONLY when `decision === "approved"` (deny leaves role null). Exact change:

```ts
export async function decideAdminAccess(args: {
  id: string;
  decision: "approved" | "denied";
  decidedByEmail: string | null;
  roleId?: string | null;
}): Promise<AdminAccessRow | null> {
  const [row] = await db
    .update(adminAccess)
    .set({
      status: args.decision,
      decidedAt: new Date(),
      decidedByEmail: args.decidedByEmail,
      roleId: args.decision === "approved" ? (args.roleId ?? null) : null,
    })
    .where(eq(adminAccess.id, args.id))
    .returning();
  return row ?? null;
}
```

- [ ] **Step 2: decision route passes `roleId`**

In `src/app/api/admin/access/[id]/decision/route.ts`, read `roleId` from the body (`body.roleId` — optional string) and pass it to `decideAdminAccess`. (The gate was changed to `requireGrant("approve_admin_requests")` in Task 5.) Validate `roleId` is a uuid if present (else ignore/400). Pass `roleId: typeof body.roleId === "string" && isUuid(body.roleId) ? body.roleId : null`.

- [ ] **Step 3: page loads roles + passes to the table**

In `src/app/(authed)/admin/access/page.tsx`, import `listRoles` from `@/lib/admin-roles`, fetch `const roles = await listRoles();`, map to `{ id, name }`, and pass `roles={roles.map(r => ({ id: r.id, name: r.name }))}` to `<AdminAccessTable>`. Also include each row's current `roleId` + role name in the serialized rows (add `roleId` + `roleName` via a join or a lookup map) so approved rows can show/repick their role.

- [ ] **Step 4: table shows a role `<select>` on approve**

In `src/components/admin/AdminAccessTable.tsx`: add `roles: { id: string; name: string }[]` to props and `roleId`/`roleName` to `AccessRow`. For PENDING rows, render a `<select>` of roles (with a "— no role (full access) —" option, value "") next to Approve/Deny; pass the chosen `roleId` in the `decide(id, "approved")` body (`JSON.stringify({ decision, roleId })`). For APPROVED rows, show the current role name. Keep the Delete button (non-pending). The `decide` fetch body becomes `{ decision, roleId }` (roleId only meaningful on approve).

- [ ] **Step 5: tsc + run access decision test**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/app/admin-access-decision.test.ts`
Expected: clean + pass (update that test if needed so an approve with a `roleId` persists it — add an assertion).

- [ ] **Step 6: PRD + commit**
```bash
git add "src/app/api/admin/access/[id]/decision/route.ts" src/lib/admin-access.ts "src/app/(authed)/admin/access/page.tsx" src/components/admin/AdminAccessTable.tsx tests/app/admin-access-decision.test.ts PRD/events-v1.md
git commit -m "feat(rbac): assign a role when approving an admin request"
```

---

### Task 7: `/admin/roles` page + `RolesManager` UI

**Files:** Create `src/app/(authed)/admin/roles/page.tsx` + `src/components/admin/RolesManager.tsx`.

- [ ] **Step 1: page (server) — gated by super-admin OR create_roles/edit_roles**

Create `src/app/(authed)/admin/roles/page.tsx`:

```tsx
import { currentUser } from "@clerk/nextjs/server";
import { can } from "@/lib/grants";
import { isSuperAdmin } from "@/lib/admin";
import { NotAuthorized } from "@/components/admin/NotAuthorized";
import { listRoles } from "@/lib/admin-roles";
import { GRANTS } from "@/lib/grants";
import { RolesManager } from "@/components/admin/RolesManager";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const allowed = (await isSuperAdmin()) || (await can("create_roles")) || (await can("edit_roles"));
  if (!allowed) {
    const user = await currentUser().catch(() => null);
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? null;
    return <NotAuthorized email={email} />;
  }
  const roles = await listRoles();
  const serialized = roles.map((r) => ({ id: r.id, name: r.name, grants: (r.grants ?? []) as string[] }));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 text-sm">
        <a href="/admin" className="link text-sm">← Admin home</a>
      </div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Roles</h1>
      <p className="text-zinc-400 text-sm -mt-2">
        Define roles and the grants each one carries. Assign a role when approving an admin on{" "}
        <a href="/admin/access" className="link">Access</a>.
      </p>
      <RolesManager roles={serialized} grantCatalog={GRANTS} />
    </div>
  );
}
```

- [ ] **Step 2: client `RolesManager`**

Create `src/components/admin/RolesManager.tsx` — a `"use client"` component that:
- shows a "+ New role" inline form (name input + a checkbox per grant from `grantCatalog`) → POST `/api/admin/roles` → `router.refresh()`.
- lists existing roles (name + grant chips), each with an Edit (toggle the same checkbox form → PATCH `/api/admin/roles/{id}`) and a Delete button (→ DELETE `/api/admin/roles/{id}`; on 409 show "role is assigned — reassign first").
- surfaces errors inline; uses `useRouter().refresh()` after mutations.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Grant = { key: string; label: string };
type Role = { id: string; name: string; grants: string[] };

export function RolesManager({ roles, grantCatalog }: { roles: Role[]; grantCatalog: Grant[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGrants, setNewGrants] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editGrants, setEditGrants] = useState<string[]>([]);

  function toggle(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  }

  async function create() {
    if (!newName.trim()) { setError("Name is required."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), grants: newGrants }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      setNewName(""); setNewGrants([]); router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grants: editGrants }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      setEditId(null); router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this role?")) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || `Failed (HTTP ${res.status})`); return; }
      router.refresh();
    } catch { setError("Network error."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* New role */}
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">New role</h2>
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Role name (e.g. Vendor)"
          className="max-w-xs rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {grantCatalog.map((g) => (
            <label key={g.key} className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={newGrants.includes(g.key)} onChange={() => setNewGrants((s) => toggle(s, g.key))} />
              {g.label}
            </label>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={create}
          className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm disabled:opacity-40">
          Create role
        </button>
      </div>

      {/* Existing roles */}
      {roles.length === 0 ? (
        <p className="text-zinc-500 text-sm">No roles yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-md border border-zinc-800 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-100 font-medium">{r.name}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={busy}
                    onClick={() => { setEditId(editId === r.id ? null : r.id); setEditGrants(r.grants); }}
                    className="rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 px-3 py-1 text-xs">
                    {editId === r.id ? "Cancel" : "Edit"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(r.id)}
                    className="rounded border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-300 px-3 py-1 text-xs">
                    Delete
                  </button>
                </div>
              </div>
              {editId === r.id ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {grantCatalog.map((g) => (
                      <label key={g.key} className="flex items-center gap-2 text-sm text-zinc-300">
                        <input type="checkbox" checked={editGrants.includes(g.key)} onChange={() => setEditGrants((s) => toggle(s, g.key))} />
                        {g.label}
                      </label>
                    ))}
                  </div>
                  <button type="button" disabled={busy} onClick={() => saveEdit(r.id)}
                    className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-4 py-1.5 text-xs disabled:opacity-40">
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {r.grants.length === 0 ? (
                    <span className="text-zinc-600 text-xs">no grants</span>
                  ) : (
                    r.grants.map((g) => (
                      <span key={g} className="px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-400 text-[11px]">
                        {grantCatalog.find((c) => c.key === g)?.label ?? g}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: tsc + route check** — `pnpm tsc --noEmit` (clean); `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/admin/roles` → 200.

- [ ] **Step 4: PRD + commit**
```bash
git add "src/app/(authed)/admin/roles/page.tsx" src/components/admin/RolesManager.tsx PRD/events-v1.md
git commit -m "feat(rbac): /admin/roles CRUD page"
```

---

### Task 8: gate UI controls + nav by grant; verify; PRD + prod note

**Files:** Modify `src/app/(authed)/admin/layout.tsx`, `src/app/(authed)/admin/score/page.tsx`, `src/app/(authed)/admin/events/page.tsx`; `PRD/events-v1.md`.

- [ ] **Step 1: nav — add Roles; gate Access + Roles links by grant**

In `admin/layout.tsx`, the nav currently shows Score · Events · Profiles · {superAdmin && Access} · Pending. Change the Access + new Roles links to show for super-admins OR the relevant grant. Compute near the existing `superAdmin`:

```ts
  const [canApprove, canManageRoles] = await Promise.all([
    can("approve_admin_requests"),
    (async () => (await can("create_roles")) || (await can("edit_roles")))(),
  ]);
```
(import `can` from `@/lib/grants`.) Then in the nav:
```tsx
            {(superAdmin || canApprove) && (
              <a href="/admin/access" className="hover:text-white">Access</a>
            )}
            {(superAdmin || canManageRoles) && (
              <a href="/admin/roles" className="hover:text-white">Roles</a>
            )}
```
(Leave Score/Events/Profiles/Pending visible to all admins — those pages gate their own actions.)

- [ ] **Step 2: `/admin/score` — gate the run-scoring controls**

In `src/app/(authed)/admin/score/page.tsx`, compute `const canRun = await can("run_scoring_jobs");` (import `can`). Wrap the "+ New Bulk Scoring Job" link and the `<RescoreAllButton .../>` so they render only when `canRun`. Pass `canRun` down or conditionally render. Also gate the per-row `<RerunButton>` (only render when `canRun`).

- [ ] **Step 3: `/admin/events` — gate create**

In `src/app/(authed)/admin/events/page.tsx`, compute `const canCreate = await can("create_events");` and render the "+ New event" link only when `canCreate`. (Edit/manage/delete controls on the event detail pages are gated by their server routes from Task 5; gating those buttons too is a nice-to-have — if the detail page has obvious create/delete buttons, wrap them in `can("manage_events")`/`can("delete_events")`, but do not block this task on hunting them down.)

- [ ] **Step 4: full verification**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/lib/grants.test.ts tests/lib/admin-roles.test.ts tests/app/admin-roles-route.test.ts tests/app/admin-access-decision.test.ts tests/app/rescore-all.test.ts tests/lib/admin-auth.test.ts`
Expected: tsc clean; all pass (re-run a file once on Neon cold-start).
Then smoke the routes on :3002: `/admin/roles`, `/admin/access`, `/admin/score`, `/admin/events` all return 200.

- [ ] **Step 5: Manual smoke (as super-admin in the browser)**

1. `/admin/roles`: create a role "Vendor" with only `create_events`; edit it; try to delete a role assigned to someone → blocked.
2. `/admin/access`: approve a pending request, choosing "Vendor" in the role dropdown.
3. Confirm a super-admin still sees/does everything (all grants).

- [ ] **Step 6: PRD + prod note + commit**

Prepend a PRD entry: Phase 2a complete; **prod migration 0014 (`admin_roles` + `admin_access.role_id`) must be applied to prod before ship** (operator runs it; additive). Note role-less approved admins remain full admins (no data seed needed). Then:
```bash
git add "src/app/(authed)/admin/layout.tsx" "src/app/(authed)/admin/score/page.tsx" "src/app/(authed)/admin/events/page.tsx" PRD/events-v1.md
git commit -m "feat(rbac): gate admin UI controls + nav by grant; Phase 2a complete"
```

---

## Self-review notes

- **Spec coverage:** `admin_roles` table (Task 1) ✓; 7 grant keys (Task 2 catalog) ✓; `/admin/roles` CRUD gated by create/edit_roles (Tasks 4,7) ✓; role assigned at approval (Task 6) ✓; grant-gating of scoring/events/approve actions server-side (Task 5) + UI (Task 8) ✓; role-in-use deletion blocked (Tasks 2,4) ✓; `approve_admin_requests` gates `/admin/access` (Task 5) ✓. Scope (theirs/all) intentionally deferred to Phase 2b (column exists, unenforced). Backward-compat (role-less approved = full admin) replaces the spec's data-seed — documented, avoids a prod data migration.
- **Type consistency:** `Grant` union + `GRANTS` catalog (Task 2) reused in Tasks 4/7/8; `getRoleForClerkUser` returns `{ grants: string[] | null } | null` (null sentinel = full admin) consistent across Tasks 2/3; `decideAdminAccess` gains `roleId?` (Task 6) matching its callers; `deleteRole` returns `"deleted"|"in_use"|"not_found"` used in Tasks 3/4.
- **No placeholders:** every code/test step is complete; route-gating (Task 5) gives the exact pattern + per-route grant mapping; commands have expected output.
- **Test-mock note (Task 5):** existing `rescore-all`/`admin-access-decision` tests mocked `@/lib/admin`; they must be updated to mock `@/lib/grants`'s `requireGrant` since the routes now gate on grants — called out explicitly in Task 5 Step 3.
```
