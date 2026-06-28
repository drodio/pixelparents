import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { updateHost, deleteHost, isHostSlugTaken } from "@/lib/hosts";
import { slugify } from "@/lib/slugify";

export const runtime = "nodejs";

type Body = { name?: string; blurb?: string | null; url?: string | null; slug?: string | null };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json()) as Body;
  const set: { name?: string; blurb?: string | null; url?: string | null; slug?: string | null } = {};
  if (body.name !== undefined) set.name = body.name.trim();
  if (body.blurb !== undefined) set.blurb = body.blurb?.trim() || null;
  if (body.url !== undefined) set.url = body.url?.trim() || null;
  if (body.slug !== undefined) {
    // Normalize to a clean slug; reject empty (a host always needs a URL) or one
    // already used by another host so /hosts/<slug> stays unambiguous.
    const slug = slugify(body.slug ?? "");
    if (!slug) return NextResponse.json({ error: "slug can’t be empty" }, { status: 400 });
    if (await isHostSlugTaken(slug, id)) {
      return NextResponse.json({ error: "that slug is already used by another host" }, { status: 409 });
    }
    set.slug = slug;
  }
  const host = await updateHost(id, set);
  if (!host) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, host });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await deleteHost(id);
  return NextResponse.json({ ok: true });
}
