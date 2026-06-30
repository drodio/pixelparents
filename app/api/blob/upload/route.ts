import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { currentUser } from "@clerk/nextjs/server";

export const runtime = "nodejs";

// Optimized images arrive already small from the client; this is a safety cap.
const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  // Auth gate: these are private family photos, so require a signed-in Clerk
  // user. Identity comes from the session (currentUser) — never the client —
  // matching the rest of the app's server routes/actions. Without this anyone
  // could write to the private blob store.
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const width = Number(form.get("width")) || undefined;
  const height = Number(form.get("height")) || undefined;

  try {
    const blob = await put(`family-photos/${file.name}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      width,
      height,
    });
  } catch (err) {
    console.error("Blob upload failed:", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
