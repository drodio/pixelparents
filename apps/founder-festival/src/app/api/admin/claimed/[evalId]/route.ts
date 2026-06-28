import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { loadClaimedProfileDetail } from "@/lib/admin-claimed";

export const runtime = "nodejs";

// Full members-only detail for one claimed profile (family/pets, event answers,
// emails). Admins see EVERYTHING regardless of the owner's visibility settings.
// SECURITY: gated by view_profiles (super-admins always hold it). Loaded lazily
// when an admin expands a row in the Claimed Profiles table.
export async function GET(_req: Request, { params }: { params: Promise<{ evalId: string }> }) {
  try {
    await requireGrant("view_profiles");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { evalId } = await params;
  const detail = await loadClaimedProfileDetail(evalId);
  return NextResponse.json(detail);
}
