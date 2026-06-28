import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getEventBySlug } from "@/lib/events";
import { getViewerEvaluationId, isEventAttendee } from "@/lib/attendee";

export const runtime = "nodejs";

// Client-upload token handshake for ATTENDEE-added event photos. Mirrors the
// admin handshake (browser uploads directly to Vercel Blob), but authorizes the
// viewer as an attendee of this event rather than via an admin grant. The DB row
// is recorded separately by the client via POST /api/events/:slug/photos.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Runs within this request → the viewer's session is present.
        const viewerEvalId = await getViewerEvaluationId();
        const event = await getEventBySlug(slug);
        if (!event || !(await isEventAttendee(event.id, viewerEvalId))) {
          throw new Error("attendees only");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic"],
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB per photo
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
