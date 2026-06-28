import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireGrant } from "@/lib/grants";
import { canAccessEvent } from "@/lib/ownership";
import {
  createEventCampaign,
  sendEventCampaign,
  isAllowedFrom,
  type CampaignRecipient,
} from "@/lib/event-email-send";
import { isValidApplicantEmail, parseBccList } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  channel?: string;
  fromAddress?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  signatureText?: string;
  bccAddress?: string | null;
  recipients?: CampaignRecipient[];
  scheduledForIso?: string | null;
};

// POST /api/admin/events/:id/emails — create + send-now (inline) or schedule a
// campaign to the selected recipients. Any event admin (manage_events + scope).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireGrant("manage_events");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await canAccessEvent(id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const fromAddress = body.fromAddress ?? "";
  if (!isAllowedFrom(fromAddress)) return NextResponse.json({ error: "invalid_from" }, { status: 400 });

  const subjectTemplate = (body.subjectTemplate ?? "").trim();
  if (!subjectTemplate) return NextResponse.json({ error: "subject_required" }, { status: 400 });
  const bodyTemplate = body.bodyTemplate ?? "";

  // Dedupe + validate recipients by email.
  const seen = new Set<string>();
  const recipients: CampaignRecipient[] = [];
  for (const r of body.recipients ?? []) {
    const email = (r?.toEmail ?? "").trim().toLowerCase();
    if (!email || !isValidApplicantEmail(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      toEmail: email,
      clerkUserId: r.clerkUserId ?? null,
      evaluationId: r.evaluationId ?? null,
      fullName: r.fullName ?? null,
      nickname: r.nickname ?? null,
      profileHref: r.profileHref ?? null,
      companyName: r.companyName ?? null,
    });
  }
  if (recipients.length === 0) return NextResponse.json({ error: "no_recipients" }, { status: 400 });

  // Optional BCC. Reject if the operator typed any token we can't parse into a
  // valid address — no silent drops (full list or a clear error, never a quiet
  // partial). Duplicates are fine (parseBccList dedupes); only invalid tokens err.
  const bccRaw = (body.bccAddress ?? "").trim();
  const bccTokens = bccRaw ? bccRaw.split(/[\s,;]+/).filter(Boolean) : [];
  if (bccTokens.some((t) => !isValidApplicantEmail(t))) {
    return NextResponse.json({ error: "invalid_bcc" }, { status: 400 });
  }
  const bccList = parseBccList(bccRaw);

  let scheduledFor: Date | null = null;
  if (body.scheduledForIso) {
    const d = new Date(body.scheduledForIso);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "invalid_schedule" }, { status: 400 });
    scheduledFor = d;
  }

  const { id: campaignId, scheduled } = await createEventCampaign({
    eventId: id,
    createdByClerkUserId: userId,
    channel: body.channel === "both" || body.channel === "text" ? body.channel : "email",
    fromAddress,
    subjectTemplate,
    bodyTemplate,
    signatureText: body.signatureText ?? "",
    bccAddress: bccList.join(", ") || null,
    recipients,
    scheduledFor,
  });

  if (scheduled) {
    return NextResponse.json({ ok: true, campaignId, scheduled: true, scheduledFor: scheduledFor!.toISOString() });
  }
  // Send-now: run inline (the same path the cron uses for scheduled ones).
  const result = await sendEventCampaign(campaignId);
  return NextResponse.json({ ok: true, campaignId, scheduled: false, ...result });
}
