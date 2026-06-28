import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { getViewerEmail } from "@/lib/grants";
import { createTicket, emailAdminNewTicket, emailUserTicketCreated } from "@/lib/support";

export const runtime = "nodejs";

// POST /api/support — file a support ticket. CLAIMED users only (the gate is a
// non-null claimed evaluation id, resolved server-side — never trust the client).
type Body = { body?: unknown };

export async function POST(req: Request) {
  const evaluationId = await getViewerEvaluationId();
  if (!evaluationId) {
    return NextResponse.json(
      { error: "Claim your profile to file a support ticket." },
      { status: 403 },
    );
  }
  let payload: Body;
  try { payload = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Please describe your issue." }, { status: 400 });
  if (body.length > 10000) return NextResponse.json({ error: "Message too long." }, { status: 400 });

  const { userId } = await auth();
  const email = await getViewerEmail();
  const ticket = await createTicket({ evaluationId, clerkUserId: userId ?? null, email, body });
  await emailAdminNewTicket(ticket, body);
  await emailUserTicketCreated(ticket, body);
  return NextResponse.json({ ok: true, id: ticket.id });
}
