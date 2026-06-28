import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/admin";
import { isUuid } from "@/lib/canonicalize";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { reEvaluate } from "@/lib/eval-pipeline";
import { getRequestGeo } from "@/lib/request-ip";
import { reportServerError } from "@/lib/report-server-error";

export const runtime = "nodejs";
// A re-score on a high-presence profile can exceed 60s; match the rescore route.
export const maxDuration = 180;

// Set an admin "name hint" (manual profile text) on an evaluation and re-score with
// it. For profiles NO public API can read — e.g. a LinkedIn profile the owner set to
// private, where Exa AND EnrichLayer both come back empty. The hint is stored
// (persists across future re-scores) and prepended to the LinkedIn page text as
// authoritative content. Super-admin only: it modifies data + triggers a paid
// re-score. An empty name+about clears the hint.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: { name?: string; about?: string };
  try {
    body = (await req.json()) as { name?: string; about?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const about = (body.about ?? "").trim();
  // First line = full name (seeds extractFullName + the grounded name-search); the
  // rest is roles/about. Null clears the hint.
  const hint = [name, about].filter(Boolean).join("\n") || null;

  try {
    await db
      .update(evaluations)
      .set({ manualProfileHint: hint, updatedAt: new Date() })
      .where(eq(evaluations.id, id));
    // reEvaluate re-reads the row, so it now picks up the stored hint.
    const result = await reEvaluate(id, { requester: getRequestGeo(req.headers) });
    return NextResponse.json(result);
  } catch (err) {
    await reportServerError(err, { route: "POST /api/admin/profiles/[id]/hint", evaluationId: id });
    return NextResponse.json({ error: "hint rescore failed" }, { status: 503 });
  }
}
