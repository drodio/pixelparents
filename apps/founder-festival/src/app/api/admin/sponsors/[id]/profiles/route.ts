import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import {
  attachSponsorProfileById,
  attachSponsorProfileByLinkedin,
  detachSponsorProfile,
  getSponsorProfiles,
} from "@/lib/sponsors";

export const runtime = "nodejs";

// POST { evaluationId } (from the search picker) OR { linkedinUrl } (legacy) —
// attach a profile to the sponsor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { evaluationId, linkedinUrl } = (await req.json()) as { evaluationId?: string; linkedinUrl?: string };
  const profile = evaluationId
    ? await attachSponsorProfileById(id, evaluationId)
    : linkedinUrl?.trim()
      ? await attachSponsorProfileByLinkedin(id, linkedinUrl)
      : null;
  if (!profile) {
    return NextResponse.json(
      { error: evaluationId ? "Profile not found" : "evaluationId or linkedinUrl required" },
      { status: evaluationId || linkedinUrl ? 404 : 400 },
    );
  }
  return NextResponse.json({ ok: true, profile });
}

// DELETE { evaluationId } — detach a profile.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { evaluationId } = (await req.json()) as { evaluationId?: string };
  if (!evaluationId) return NextResponse.json({ error: "evaluationId required" }, { status: 400 });
  await detachSponsorProfile(id, evaluationId);
  return NextResponse.json({ ok: true, profiles: await getSponsorProfiles(id) });
}
