import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createFamilyMember, getOwnerEvaluationId, listFamilyMembersForOwner } from "@/lib/family";

export const dynamic = "force-dynamic";

// Resolve the caller's owning evaluation (claimed profile), or null.
async function ownerEval(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getOwnerEvaluationId(userId);
}

export async function GET() {
  const evalId = await ownerEval();
  if (!evalId) return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  return NextResponse.json({ members: await listFamilyMembersForOwner(evalId) });
}

export async function POST(req: Request) {
  const evalId = await ownerEval();
  if (!evalId) return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const id = await createFamilyMember(evalId, body);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad_request" }, { status: 400 });
  }
}
