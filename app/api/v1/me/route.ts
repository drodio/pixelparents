import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/me — public tier. Lets a developer see their key's status and
// whether it's been upgraded to 'approved' yet.
export async function GET(req: Request) {
  const auth = await authorize(req, "public");
  if (!auth.ok) return auth.res;
  const { tier, label, createdAt, approvedAt } = auth.key;
  return NextResponse.json({
    tier,
    label,
    created_at: createdAt,
    approved_at: approvedAt,
    approved: tier === "approved",
  });
}
