import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";
import { setStatus } from "@/lib/support";

export const runtime = "nodejs";

// POST /api/admin/support/[id] — super-admin closes or reopens a ticket.
type Body = { status?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (body.status !== "open" && body.status !== "closed") {
    return NextResponse.json({ error: "status must be open|closed" }, { status: 400 });
  }
  const ok = await setStatus(id, body.status);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
