import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";
import { getStats } from "@/lib/db/aggregates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/stats — requires an approved key. Ultra-abstract aggregates only.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  return NextResponse.json(await getStats());
}
