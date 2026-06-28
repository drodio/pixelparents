import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireGrant } from "@/lib/grants";
import { updateSponsor } from "@/lib/sponsors";
import { storeImageFromUrl } from "@/lib/icon-blob";

export const runtime = "nodejs";

// POST /api/admin/sponsors/:id/logo — set a sponsor logo, either by uploading a
// file (multipart form, field "file") OR by picking a searched image (JSON
// { imageUrl }). The latter is fetched + copied into our Blob, never hot-linked.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage not configured (BLOB_READ_WRITE_TOKEN missing)" }, { status: 503 });
  }

  let logoUrl: string;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const { imageUrl } = (await req.json().catch(() => ({}))) as { imageUrl?: unknown };
    if (typeof imageUrl !== "string" || !imageUrl) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }
    try {
      logoUrl = await storeImageFromUrl(`sponsors/${id}`, imageUrl);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`sponsors/${id}/${safeName}`, file, { access: "public", addRandomSuffix: true });
    logoUrl = blob.url;
  }

  const sponsor = await updateSponsor(id, { logoUrl });
  if (!sponsor) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, logoUrl, url: logoUrl });
}
