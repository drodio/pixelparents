import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { getBalanceCents } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  const balance_cents = await getBalanceCents(key.clerkUserId);
  return NextResponse.json({ balance_cents });
}
