import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { decideConnectionRequest, introduceConnection } from "@/lib/attendee-connections";

export const runtime = "nodejs";

// POST /api/connections/decide { requestId, decision } — the target approves or
// denies a pending connection request.
export async function POST(req: Request) {
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { requestId, decision } = (await req.json()) as { requestId?: string; decision?: string };
  if (!requestId || (decision !== "approved" && decision !== "denied")) {
    return NextResponse.json({ error: "requestId + decision required" }, { status: 400 });
  }
  const row = await decideConnectionRequest(requestId, viewerEvalId, decision);
  if (!row) return NextResponse.json({ error: "not found or not yours" }, { status: 404 });
  if (row.status === "approved") {
    try {
      await introduceConnection(row, new URL(req.url).origin);
    } catch (err) {
      console.error("[connections/decide] intro email failed:", err);
    }
  }
  return NextResponse.json({ ok: true, status: row.status });
}
