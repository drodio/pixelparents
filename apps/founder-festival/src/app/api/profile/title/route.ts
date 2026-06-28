import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { isEvalOwner } from "@/lib/authz";
import { isUuid } from "@/lib/canonicalize";

export const dynamic = "force-dynamic";

// POST /api/profile/title — the owner edits the credibility title (the LLM-
// generated one-liner above their badges). Owner-only (high-confidence claim);
// an empty title clears it back to null.
//
// Body: { evaluationId, title }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { evaluationId?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const evaluationId = body.evaluationId;
  if (!isUuid(evaluationId)) {
    return NextResponse.json({ error: "invalid evaluationId" }, { status: 400 });
  }
  if (!(await isEvalOwner(userId, evaluationId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const title = (body.title ?? "").trim().slice(0, 200) || null;
  await db.update(evaluations).set({ credibilityTitle: title }).where(eq(evaluations.id, evaluationId));
  return NextResponse.json({ ok: true, title });
}
