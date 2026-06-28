import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { attachHostProfileById, detachHostProfile, getHostProfiles } from "@/lib/hosts";

export const runtime = "nodejs";

// POST { evaluationId } — attach a profile to the host (from the search picker).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { evaluationId } = (await req.json()) as { evaluationId?: string };
  if (!evaluationId) return NextResponse.json({ error: "evaluationId required" }, { status: 400 });
  const profile = await attachHostProfileById(id, evaluationId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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
  await detachHostProfile(id, evaluationId);
  return NextResponse.json({ ok: true, profiles: await getHostProfiles(id) });
}
