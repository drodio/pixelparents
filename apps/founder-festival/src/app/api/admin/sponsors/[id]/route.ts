import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { updateSponsor, deleteSponsor } from "@/lib/sponsors";

export const runtime = "nodejs";

type Body = { name?: string; blurb?: string | null; websiteUrl?: string | null };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json()) as Body;
  const set: { name?: string; blurb?: string | null; websiteUrl?: string | null } = {};
  if (body.name !== undefined) set.name = body.name.trim();
  if (body.blurb !== undefined) set.blurb = body.blurb?.trim() || null;
  if (body.websiteUrl !== undefined) set.websiteUrl = body.websiteUrl?.trim() || null;
  const sponsor = await updateSponsor(id, set);
  if (!sponsor) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, sponsor });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await deleteSponsor(id);
  return NextResponse.json({ ok: true });
}
