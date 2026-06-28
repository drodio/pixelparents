import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { listAllBadges } from "@/lib/event-badges-catalog";

export const runtime = "nodejs";

// GET /api/admin/event-badges — the whole badge vocabulary, for the inline
// picker's autocomplete.
export async function GET() {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const badges = await listAllBadges();
  return NextResponse.json({ badges });
}
