import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { requireGrant } from "@/lib/grants";
import { decideAdminAccess } from "@/lib/admin-access";
import { isUuid } from "@/lib/canonicalize";

export const runtime = "nodejs";

type Body = { decision?: string; roleId?: string };

// Approve or deny an admin-access request. SECURITY: gated by the
// approve_admin_requests grant (super-admins always hold it). The gate is
// server-side; the UI buttons are convenience only.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("approve_admin_requests");
  } catch {
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
    (
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null
    )?.toLowerCase() ?? null;
  const row = await decideAdminAccess({
    id,
    decision: body.decision,
    decidedByEmail,
    roleId: typeof body.roleId === "string" && isUuid(body.roleId) ? body.roleId : null,
  });
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: row.status });
}
