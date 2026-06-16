import { NextResponse } from "next/server";
import { authorize } from "@/lib/api/authorize";
import { getInterestsPool } from "@/lib/db/aggregates";
import { OPTIONS } from "@/lib/options";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/options — approved tier. Non-PII reference data: the static option
// taxonomies plus the live distinct-interests pool.
export async function GET(req: Request) {
  const auth = await authorize(req, "approved");
  if (!auth.ok) return auth.res;
  return NextResponse.json({
    ...OPTIONS,
    interests: await getInterestsPool(),
  });
}
