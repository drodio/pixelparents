import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import {
  canApplyOrgBadge,
  applyOrgBadgeToProfiles,
  removeOrgBadgeFromProfiles,
} from "@/lib/org-badges";

export const runtime = "nodejs";

// POST /api/admin/badges/bulk — apply or remove one org (host/sponsor) badge
// across many scored profiles at once. Powers the "Apply these badges to all
// profiles below" controls on the scored-profiles table.
//
// Body: { badgeId: <org_badge uuid>, evaluationIds: string[], action: "apply" | "remove" }
//
// AUTHORIZATION: the viewer must be an admin AND authorized for this specific
// badge — super-admins may apply any org badge; other admins only the badges of
// hosts/sponsors they're assigned to. Re-checked server-side (never trust the
// client's button state).
type Body = { badgeId?: string; evaluationIds?: unknown; action?: string };

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
  const { badgeId, action } = body;
  const evaluationIds = Array.isArray(body.evaluationIds)
    ? body.evaluationIds.filter((x): x is string => typeof x === "string")
    : [];
  if (!badgeId || (action !== "apply" && action !== "remove")) {
    return NextResponse.json({ error: "badgeId and action (apply|remove) required" }, { status: 400 });
  }
  if (evaluationIds.length === 0) {
    return NextResponse.json({ error: "no evaluationIds" }, { status: 400 });
  }

  if (!(await canApplyOrgBadge(badgeId))) {
    return NextResponse.json({ error: "not authorized for this badge" }, { status: 403 });
  }

  if (action === "apply") {
    await applyOrgBadgeToProfiles(badgeId, evaluationIds);
  } else {
    await removeOrgBadgeFromProfiles(badgeId, evaluationIds);
  }
  return NextResponse.json({ ok: true, count: evaluationIds.length });
}
