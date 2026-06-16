import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";
import { getBreakdowns } from "@/lib/db/aggregates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/breakdowns — requires an approved key. Aggregate COUNTS by
// dimension only; never individual rows or any PII.
export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.res;
  return NextResponse.json(await getBreakdowns());
}
