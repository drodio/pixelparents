import { NextResponse } from "next/server";
import { getViewerEvaluationId } from "@/lib/attendee";
import { setConnectionPreference, type RequesterGroup, type PrefAction } from "@/lib/attendee-connections";

export const runtime = "nodejs";

const GROUPS: RequesterGroup[] = ["founder", "investor", "sponsor"];
const ACTIONS: PrefAction[] = ["auto_approve", "auto_deny", "ask"];

// POST /api/connections/preferences { scope, group, action } — set the viewer's
// auto-handling preference. scope = "global" or an event id.
export async function POST(req: Request) {
  const viewerEvalId = await getViewerEvaluationId();
  if (!viewerEvalId) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const { scope, group, action } = (await req.json()) as { scope?: string; group?: string; action?: string };
  if (!scope || !GROUPS.includes(group as RequesterGroup) || !ACTIONS.includes(action as PrefAction)) {
    return NextResponse.json({ error: "scope + valid group + action required" }, { status: 400 });
  }
  await setConnectionPreference(viewerEvalId, scope, group as RequesterGroup, action as PrefAction);
  return NextResponse.json({ ok: true });
}
