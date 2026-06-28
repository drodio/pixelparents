import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";
import { publishSuggestion, discardSuggestion } from "@/lib/docs";

export const runtime = "nodejs";

// POST /api/docs/[slug]/suggestions/[id] — super-admin publishes or discards a
// ship-time doc-update suggestion. Body: { action: "publish" | "discard" }.
type Body = { action?: string };

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (body.action === "publish") {
    const ok = await publishSuggestion(id);
    if (!ok) return NextResponse.json({ error: "not_pending" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "discard") {
    const ok = await discardSuggestion(id);
    if (!ok) return NextResponse.json({ error: "not_pending" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action must be publish|discard" }, { status: 400 });
}
