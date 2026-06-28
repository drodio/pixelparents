import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { scoreItems, profileEmails } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { sendClaimUserEmail, getThreadForItem } from "@/lib/claim-thread";
import { reportServerError } from "@/lib/report-server-error";

// The verified email we'd email about a claim — prefills the compose "To".
async function suggestedRecipient(evaluationId: string): Promise<string | null> {
  const [pe] = await db
    .select({ email: profileEmails.email })
    .from(profileEmails)
    .where(and(eq(profileEmails.evaluationId, evaluationId), eq(profileEmails.status, "verified")))
    .limit(1);
  return pe?.email ?? null;
}

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/score-items/[id]/email — the message thread for a claim (admin-only).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const [item] = await db
    .select({ evaluationId: scoreItems.evaluationId })
    .from(scoreItems)
    .where(eq(scoreItems.id, id))
    .limit(1);
  const suggestedTo = item ? await suggestedRecipient(item.evaluationId) : null;
  const thread = await getThreadForItem(id);
  return NextResponse.json({ suggestedTo, ...(thread ?? { requestNumber: null, messages: [] }) });
}

// POST /api/score-items/[id]/email — admin composes + sends an email to the
// claim owner. Body: { to: string, subject: string, body: string }. The thread
// (and its request number) is created on first send. Stamps "(Request #NNNNN)"
// into the subject so replies thread back via the inbound webhook.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  let body: { to?: string; subject?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.body ?? "").trim();
  if (!to) return NextResponse.json({ error: "recipient required" }, { status: 400 });
  if (!message) return NextResponse.json({ error: "message body required" }, { status: 400 });

  const [item] = await db
    .select({ evaluationId: scoreItems.evaluationId })
    .from(scoreItems)
    .where(eq(scoreItems.id, id))
    .limit(1);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const result = await sendClaimUserEmail({
      scoreItemId: id,
      evaluationId: item.evaluationId,
      to,
      subject,
      body: message,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await reportServerError(err, { route: "POST /api/score-items/[id]/email", id });
    const msg = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
