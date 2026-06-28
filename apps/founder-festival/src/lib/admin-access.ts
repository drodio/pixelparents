import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

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

// All rows, pending first, then most-recently-requested. For the /admin/access list.
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

// Proactively grant admin to a Clerk user (no prior request needed). Upserts an
// "approved" row keyed on clerkUserId: inserts when absent, or flips an existing
// pending/denied row to approved. Returns the resulting row.
// Reassign (or clear) the role on an existing admin_access row. Returns false
// if no such row. Used by the "Edit Role" control on approved admins.
export async function setAdminAccessRole(id: string, roleId: string | null): Promise<boolean> {
  const rows = await db
    .update(adminAccess)
    .set({ roleId })
    .where(eq(adminAccess.id, id))
    .returning({ id: adminAccess.id });
  return rows.length > 0;
}

export async function grantAdminAccess(args: {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  roleId: string | null;
  decidedByEmail: string | null;
}): Promise<AdminAccessRow> {
  const [row] = await db
    .insert(adminAccess)
    .values({
      clerkUserId: args.clerkUserId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      status: "approved",
      roleId: args.roleId,
      decidedAt: new Date(),
      decidedByEmail: args.decidedByEmail,
    })
    .onConflictDoUpdate({
      target: adminAccess.clerkUserId,
      set: {
        status: "approved",
        roleId: args.roleId,
        decidedAt: new Date(),
        decidedByEmail: args.decidedByEmail,
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
      },
    })
    .returning();
  return row!;
}

// One row by id, for the admin detail page. Null if unknown.
export async function getAdminAccessById(id: string): Promise<AdminAccessRow | null> {
  const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id)).limit(1);
  return row ?? null;
}

// Rename an admin (the display name shown across the admin UI). Returns false if
// the id is unknown.
export async function setAdminAccessName(id: string, name: string | null): Promise<boolean> {
  const rows = await db
    .update(adminAccess)
    .set({ name })
    .where(eq(adminAccess.id, id))
    .returning({ id: adminAccess.id });
  return rows.length > 0;
}

// Of the given Clerk user ids, which already have an APPROVED admin_access row.
export async function approvedClerkUserIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ clerkUserId: adminAccess.clerkUserId })
    .from(adminAccess)
    .where(and(inArray(adminAccess.clerkUserId, ids), eq(adminAccess.status, "approved")));
  return new Set(rows.map((r) => r.clerkUserId));
}

// Hard-delete one row by id (revokes access entirely — the person drops off the
// list and, with no row, is no longer an admin; they may request again later).
// Returns true if a row was deleted, false if the id was unknown.
export async function deleteAdminAccess(id: string): Promise<boolean> {
  const deleted = await db
    .delete(adminAccess)
    .where(eq(adminAccess.id, id))
    .returning({ id: adminAccess.id });
  return deleted.length > 0;
}
