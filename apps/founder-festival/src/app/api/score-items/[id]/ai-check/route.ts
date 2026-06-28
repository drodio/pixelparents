import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scoreItems, evaluations } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { aiCheckClaim } from "@/lib/claim-ai-check";
import { reportServerError } from "@/lib/report-server-error";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/score-items/[id]/ai-check — run an LLM verifiability check on a pending
// owner-edited claim. Admin-only (it spends Exa + LLM). Returns confidence + verdict.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const [item] = await db
    .select({ reason: scoreItems.reason, evaluationId: scoreItems.evaluationId })
    .from(scoreItems)
    .where(eq(scoreItems.id, id))
    .limit(1);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [evalRow] = await db
    .select({ fullName: evaluations.fullName })
    .from(evaluations)
    .where(eq(evaluations.id, item.evaluationId))
    .limit(1);
  try {
    const result = await aiCheckClaim(evalRow?.fullName ?? null, item.reason);
    return NextResponse.json(result);
  } catch (err) {
    await reportServerError(err, { route: "POST /api/score-items/[id]/ai-check", id });
    return NextResponse.json({ error: "ai_check_failed" }, { status: 503 });
  }
}
