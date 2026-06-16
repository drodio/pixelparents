import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/me — confirms the key is valid. Reaching a 200 here means the key
// is approved and active (verifyApiKey only accepts approved, non-revoked keys).
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  return NextResponse.json({ status: "approved" });
}
