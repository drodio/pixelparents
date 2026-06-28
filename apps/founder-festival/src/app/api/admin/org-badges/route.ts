import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import {
  listOrgBadges,
  createOrgBadge,
  deleteOrgBadge,
  canManageOrg,
  canApplyOrgBadge,
  renameOrgBadge,
  type OrgOwnerType,
} from "@/lib/org-badges";

export const runtime = "nodejs";

function isOwnerType(v: unknown): v is OrgOwnerType {
  return v === "host" || v === "sponsor";
}

// GET /api/admin/org-badges?ownerType=host&ownerId=<uuid> — list a host/sponsor's badges.
export async function GET(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const ownerType = searchParams.get("ownerType");
  const ownerId = searchParams.get("ownerId");
  if (!isOwnerType(ownerType) || !ownerId) {
    return NextResponse.json({ error: "ownerType (host|sponsor) and ownerId required" }, { status: 400 });
  }
  return NextResponse.json({ badges: await listOrgBadges(ownerType, ownerId) });
}

// POST /api/admin/org-badges — create a custom badge on a host/sponsor.
// Body: { ownerType: "host" | "sponsor", ownerId: string, label: string }
type PostBody = { ownerType?: string; ownerId?: string; label?: string };

export async function POST(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const { ownerType, ownerId } = body;
  const label = body.label?.trim();
  if (!isOwnerType(ownerType) || !ownerId) {
    return NextResponse.json({ error: "ownerType (host|sponsor) and ownerId required" }, { status: 400 });
  }
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  // SECURITY: manage_events is delegatable; without this an admin scoped to one
  // org could mint badges on ANY org. Require an assignment to this owner.
  if (!(await canManageOrg(ownerType, ownerId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const badge = await createOrgBadge(ownerType, ownerId, label);
  return NextResponse.json({ ok: true, badge });
}

// PATCH /api/admin/org-badges — rename a badge (updates catalog label + all applied overrides).
// Body: { id: string, label: string }
type PatchBody = { id?: string; label?: string };

export async function PATCH(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const label = body.label?.trim();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  if (!(await canApplyOrgBadge(body.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const badge = await renameOrgBadge(body.id, label);
  if (!badge) return NextResponse.json({ error: "badge not found" }, { status: 404 });
  return NextResponse.json({ ok: true, badge });
}

// DELETE /api/admin/org-badges — remove a custom badge (and any applied overrides).
// Body: { id: string }
type DeleteBody = { id?: string };

export async function DELETE(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as DeleteBody;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  // SECURITY: deleteOrgBadge cascades a strip from EVERY profile carrying it, so
  // a scoped admin must own this badge's org. canApplyOrgBadge = superadmin OR an
  // assignment to the badge's (ownerType, ownerId).
  if (!(await canApplyOrgBadge(body.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteOrgBadge(body.id);
  return NextResponse.json({ ok: true });
}
