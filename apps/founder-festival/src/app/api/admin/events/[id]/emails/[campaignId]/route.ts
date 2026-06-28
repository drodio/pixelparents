import { NextResponse } from "next/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import { getEventCampaignDetail, type CampaignRecipient } from "@/lib/event-email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/events/:id/emails/:campaignId — one campaign's detail + its
// per-recipient sent rows (the past-communications drill-down). manage_events-gated.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id, campaignId } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const detail = await getEventCampaignDetail(campaignId);
  if (!detail || detail.campaign.eventId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const c = detail.campaign;
  const snapshot = (c.recipients ?? []) as CampaignRecipient[];
  return NextResponse.json({
    campaign: {
      id: c.id,
      channel: c.channel,
      fromAddress: c.fromAddress,
      subjectTemplate: c.subjectTemplate,
      bodyTemplate: c.bodyTemplate,
      signatureText: c.signatureText ?? "",
      recipientCount: c.recipientCount,
      status: c.status,
      scheduledFor: c.scheduledFor ? c.scheduledFor.toISOString() : null,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    },
    // Recipients snapshot (who it targets). For sent campaigns the actual
    // delivered rows live in member_messages too.
    recipients: snapshot.map((r) => ({ toEmail: r.toEmail, fullName: r.fullName })),
    delivered: detail.recipients.map((m) => ({
      toEmail: m.toEmail,
      subject: m.subject,
      sentAt: m.sentAt instanceof Date ? m.sentAt.toISOString() : String(m.sentAt),
    })),
  });
}
