import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { updateRole, deleteRole } from "@/lib/admin-roles";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

type Patch = {
  name?: string;
  grants?: string[];
  costMultiplier?: number;
  usersScope?: string;
  eventsScope?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { await requireGrant("edit_roles"); } catch { return NextResponse.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  let body: Patch;
  try { body = (await req.json()) as Patch; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const patch: Patch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body.grants)) patch.grants = body.grants.filter((g) => typeof g === "string");
  if (body.costMultiplier !== undefined) patch.costMultiplier = body.costMultiplier;
  if (typeof body.usersScope === "string") patch.usersScope = body.usersScope;
  if (typeof body.eventsScope === "string") patch.eventsScope = body.eventsScope;
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
