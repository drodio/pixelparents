import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isSuperAdmin } from "@/lib/admin";
import {
  deleteAdminAccess,
  setAdminAccessRole,
  setAdminAccessName,
  getAdminAccessById,
} from "@/lib/admin-access";
import { setAdminAssignments, type OrgAssignment } from "@/lib/org-badges";
import { logAdminAction } from "@/lib/admin-api";
import { requireGrant } from "@/lib/grants";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

// PATCH /api/admin/access/[id] — edit an approved admin. Gated by
// approve_admin_requests (super-admins always hold it). Three independent,
// optional updates in one route, applied only when the field is present:
//   - roleId:      reassign/clear the role (omitted/invalid → cleared)
//   - name:        rename the admin (the display name across the admin UI)
//   - assignments: replace the admin's host/sponsor associations (authorizes
//                  which org badges they may bulk-apply)
type PatchBody = {
  roleId?: unknown;
  name?: unknown;
  assignments?: unknown;
};

function parseAssignments(v: unknown): OrgAssignment[] | null {
  if (!Array.isArray(v)) return null;
  const out: OrgAssignment[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") continue;
    const ownerType = (a as { ownerType?: unknown }).ownerType;
    const ownerId = (a as { ownerId?: unknown }).ownerId;
    if ((ownerType === "host" || ownerType === "sponsor") && typeof ownerId === "string" && isUuid(ownerId)) {
      out.push({ ownerType, ownerId });
    }
  }
  return out;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("approve_admin_requests");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  // The row must exist for any of the updates to apply.
  const row = await getAdminAccessById(id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if ("roleId" in body) {
    const roleId = typeof body.roleId === "string" && isUuid(body.roleId) ? body.roleId : null;
    await setAdminAccessRole(id, roleId);
  }
  if ("name" in body) {
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    await setAdminAccessName(id, name);
  }
  if ("assignments" in body) {
    const assignments = parseAssignments(body.assignments);
    if (assignments === null) {
      return NextResponse.json({ error: "assignments must be an array" }, { status: 400 });
    }
    await setAdminAssignments(row.clerkUserId, assignments);
  }

  return NextResponse.json({ ok: true });
}

// Delete an admin-access row — used to revoke a previously-approved admin (or to
// clean up a denied entry). SECURITY: super-admin-only, server-side; the UI
// button is convenience only. Hard delete: the person loses admin access and
// can request again later.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { userId } = await auth();
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const ok = await deleteAdminAccess(id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await logAdminAction({
    clerkUserId: userId,
    email: null,
    status: 200,
    req: _req,
    meta: { action: "revoke_admin_access", accessId: id },
  });
  return NextResponse.json({ ok: true });
}
