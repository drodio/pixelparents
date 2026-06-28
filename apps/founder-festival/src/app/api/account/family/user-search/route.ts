import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOwnerEvaluationId, searchClaimableViewers } from "@/lib/family";

export const dynamic = "force-dynamic";

// Claimed users matching ?q= by name, for the "specific users" viewer picker.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ users: [] });
  const evalId = await getOwnerEvaluationId(userId);
  if (!evalId) return NextResponse.json({ users: [] });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [] });
  return NextResponse.json({ users: await searchClaimableViewers(q, evalId) });
}
