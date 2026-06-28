import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteFamilyMember, getOwnerEvaluationId, updateFamilyMember } from "@/lib/family";

export const dynamic = "force-dynamic";

async function ownerEval(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getOwnerEvaluationId(userId);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evalId = await ownerEval();
  if (!evalId) return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const ok = await updateFamilyMember(id, evalId, body);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad_request" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evalId = await ownerEval();
  if (!evalId) return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  const ok = await deleteFamilyMember(id, evalId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
