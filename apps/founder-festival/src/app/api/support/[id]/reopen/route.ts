import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { isSuperAdmin } from "@/lib/admin";
import { getTicket, setStatus, emailAdminReopened } from "@/lib/support";

export const runtime = "nodejs";

// POST /api/support/[id]/reopen — the ticket OWNER (or a super-admin) reopens a
// closed ticket they don't feel was fully resolved. Owner reopens ping the admin
// inbox so the team knows to take another look.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [superAdmin, viewerEval] = await Promise.all([isSuperAdmin(), getViewerEvaluationId()]);
  const isOwner = !!viewerEval && viewerEval === ticket.evaluationId;
  if (!superAdmin && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ok = await setStatus(id, "open");
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Notify the team when a member (not an admin) reopens.
  if (!superAdmin && isOwner) await emailAdminReopened(ticket);

  return NextResponse.json({ ok: true });
}
