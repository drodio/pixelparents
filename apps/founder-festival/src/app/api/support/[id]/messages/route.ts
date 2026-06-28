import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { isSuperAdmin } from "@/lib/admin";
import {
  getTicket,
  addMessage,
  emailUserReply,
  emailAdminUserReply,
} from "@/lib/support";

export const runtime = "nodejs";

// POST /api/support/[id]/messages — add a reply to a ticket.
//   - the ticket owner (claimed evaluationId match) posts a 'user' message → pings the admin inbox
//   - a super-admin posts an 'admin' message → emails the filer a link to reply in-app
// authorType is derived from WHO is calling, never from the client.
type Body = { body?: unknown };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const superAdmin = await isSuperAdmin();
  const viewerEval = await getViewerEvaluationId();
  const isOwner = !!viewerEval && viewerEval === ticket.evaluationId;
  if (!superAdmin && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: Body;
  try { payload = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Empty message." }, { status: 400 });
  if (body.length > 10000) return NextResponse.json({ error: "Message too long." }, { status: 400 });

  // Owner who is ALSO a super-admin (e.g. DROdio testing) posts as the owner from
  // the /docs thread; the admin console always posts as admin. Disambiguate by
  // the caller's intent via a header set by the admin console.
  const asAdmin = superAdmin && req.headers.get("x-support-actor") === "admin";
  const authorType: "user" | "admin" = asAdmin ? "admin" : isOwner ? "user" : "admin";

  await addMessage(id, authorType, body);
  if (authorType === "admin") await emailUserReply(ticket, body);
  else await emailAdminUserReply(ticket, body);

  return NextResponse.json({ ok: true });
}
