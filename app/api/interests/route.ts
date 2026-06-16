import { NextResponse } from "next/server";
import { getInterestPool } from "@/lib/interests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const interests = await getInterestPool();
  return NextResponse.json({ interests });
}
