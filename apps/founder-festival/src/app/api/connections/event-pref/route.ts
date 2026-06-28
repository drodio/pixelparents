import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { setConnectionChoice, type PrefAction } from "@/lib/attendee-connections";

export const runtime = "nodejs";

const CHOICES: PrefAction[] = ["auto_approve", "ask", "auto_deny"];

// POST /api/connections/event-pref { scope, choice } — set the viewer's simple
// connection choice for an event (scope = event id) or their global default
// (scope = "global"). Fans out across all requester groups.
export async function POST(req: Request) {
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { scope, choice } = (await req.json()) as { scope?: string; choice?: string };
  if (!scope || !CHOICES.includes(choice as PrefAction)) {
    return NextResponse.json({ error: "scope + valid choice required" }, { status: 400 });
  }
  await setConnectionChoice(viewerEvalId, scope, choice as PrefAction);
  return NextResponse.json({ ok: true });
}
