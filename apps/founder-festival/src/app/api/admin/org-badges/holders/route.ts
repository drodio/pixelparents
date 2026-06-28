import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canApplyOrgBadge, listOrgBadgeHolders } from "@/lib/org-badges";

export const runtime = "nodejs";

// GET /api/admin/org-badges/holders?id=<orgBadgeId>
// Returns { rows: LeaderboardRow[] } for everyone currently holding this badge.
export async function GET(req: Request) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!(await canApplyOrgBadge(id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await listOrgBadgeHolders(id);
  return NextResponse.json({ rows });
}
