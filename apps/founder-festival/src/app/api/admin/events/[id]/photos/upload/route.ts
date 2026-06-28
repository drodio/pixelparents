import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";

export const runtime = "nodejs";

// Client-upload token handshake for event photos. The browser uploads the file
// DIRECTLY to Vercel Blob (via @vercel/blob/client `upload`), so the bytes never
// pass through this function — that avoids Vercel's ~4.5MB function request-body
// limit, which previously made large photos fail with a plain-text 413
// ("Request Entity Too Large") that the client couldn't parse as JSON.
//
// This endpoint only (a) authorizes the upload + mints a short-lived client token
// and (b) receives Vercel's onUploadCompleted callback. The DB row is recorded
// separately by the client via `POST /api/admin/events/:id/photos` with the
// returned blob URL, so we get the row back immediately and it also works on
// localhost (where the server-to-server onUploadCompleted callback can't reach).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // event id — used for the per-event scope check
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Runs within this request, so the admin's session cookies are present
        // and the grant check authorizes as the real user.
        await requireGrant("manage_events");
        // SECURITY: scope the upload to events this admin can access (the grant
        // is delegatable). Throwing aborts the token mint.
        if (!(await canAccessEvent(id))) throw new Error("forbidden");
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/avif",
            "image/heic",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB ceiling per photo
        };
      },
      // DB recording is done by the explicit /photos POST from the client (see
      // note above); nothing to do here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    // handleUpload throws if onBeforeGenerateToken rejects (e.g. no grant) or the
    // body is malformed. Surface a clean JSON error the client can read.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
