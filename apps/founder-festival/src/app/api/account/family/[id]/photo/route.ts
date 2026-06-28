import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getOwnedPhotoUrl, getOwnerEvaluationId, setPhotoUrl } from "@/lib/family";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export const dynamic = "force-dynamic";

async function ownerEval(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getOwnerEvaluationId(userId);
}

// Upload a family member's photo. Stored in Vercel Blob with a random suffix;
// the raw URL is kept server-side and only ever served via GET below.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evalId = await ownerEval();
  if (!evalId) return NextResponse.json({ error: "not_claimed" }, { status: 403 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "blob_not_configured" }, { status: 500 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 400 });
  const safeName = (file.name || "photo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const blob = await put(`family/${evalId}/${id}/${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  const ok = await setPhotoUrl(id, evalId, blob.url);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, photoHref: `/api/account/family/${id}/photo` });
}

// Serve the photo bytes — owner-gated (v1). Streams from the blob so the raw
// URL never reaches the client.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const evalId = await ownerEval();
  if (!evalId) return new NextResponse("forbidden", { status: 403 });
  const url = await getOwnedPhotoUrl(id, evalId);
  if (!url) return new NextResponse("not found", { status: 404 });
  const upstream = await fetchWithTimeout(url);
  if (!upstream.ok || !upstream.body) return new NextResponse("not found", { status: 404 });
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=300",
    },
  });
}
