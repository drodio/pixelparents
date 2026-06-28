import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { sendPreviewEmail, isAllowedFrom, type CampaignRecipient } from "@/lib/event-email-send";
import { isValidApplicantEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  toEmail?: string;
  fromAddress?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  signatureText?: string;
  recipient?: CampaignRecipient; // the attendee currently shown in the preview pane
};

// POST /api/admin/events/:id/emails/preview — send ONE test email to `toEmail`,
// rendered for the currently-previewed attendee. Not logged to anyone's account.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const toEmail = (body.toEmail ?? "").trim();
  if (!isValidApplicantEmail(toEmail)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (!isAllowedFrom(body.fromAddress ?? "")) return NextResponse.json({ error: "invalid_from" }, { status: 400 });

  const r = body.recipient;
  const recipient: CampaignRecipient = {
    toEmail: r?.toEmail ?? toEmail,
    clerkUserId: r?.clerkUserId ?? null,
    evaluationId: r?.evaluationId ?? null,
    fullName: r?.fullName ?? null,
    nickname: r?.nickname ?? null,
    profileHref: r?.profileHref ?? null,
    companyName: r?.companyName ?? null,
  };

  try {
    await sendPreviewEmail({
      toEmail,
      fromAddress: body.fromAddress!,
      subjectTemplate: body.subjectTemplate ?? "",
      bodyTemplate: body.bodyTemplate ?? "",
      signatureText: body.signatureText ?? "",
      recipient,
      eventId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[event-email] preview send failed", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
