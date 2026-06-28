import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";
import { auth } from "@clerk/nextjs/server";
import { isDocPageSlug } from "@/lib/docs-nav";
import { updateDocPage } from "@/lib/docs";

export const runtime = "nodejs";

// PATCH /api/docs/[slug] — super-admin inline edit of a doc page's markdown.
type Body = { bodyMd?: unknown };

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { slug } = await ctx.params;
  if (!isDocPageSlug(slug)) {
    return NextResponse.json({ error: "unknown doc page" }, { status: 404 });
  }
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  if (typeof body.bodyMd !== "string") {
    return NextResponse.json({ error: "bodyMd (string) required" }, { status: 400 });
  }
  const { userId } = await auth();
  const ok = await updateDocPage(slug, body.bodyMd, userId ?? "admin");
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
