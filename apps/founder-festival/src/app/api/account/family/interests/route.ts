import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getInterestSuggestions, getOwnerEvaluationId } from "@/lib/family";

export const dynamic = "force-dynamic";

// Global interest suggestion pool (most common first). Owner-gated like the rest
// of the section, though the pool itself is shared across users.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ interests: [] });
  const evalId = await getOwnerEvaluationId(userId);
  if (!evalId) return NextResponse.json({ interests: [] });
  return NextResponse.json({ interests: await getInterestSuggestions() });
}
