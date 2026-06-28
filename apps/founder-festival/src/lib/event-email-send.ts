import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { messageCampaigns, memberMessages, users, events } from "@/db/schema";
import { sendRawEmailWithoutSignature, isValidApplicantEmail, parseBccList } from "@/lib/email";
import { getStoredPersonalizedForEvent } from "@/lib/personalized-store";
import { getStoredConnectionsForEvent } from "@/lib/recommended-connections-store";
import { type EventForVars } from "@/lib/email-variables";
import {
  buildEmailHtml,
  renderForRecipient,
  type CampaignRecipient,
} from "@/lib/email-render";

// A composed event email/text "blast". The pure rendering (HTML assembly +
// per-recipient substitution) lives in @/lib/email-render so the exact bytes a
// recipient receives are unit-testable and identical to the live preview. Re-
// exported here so existing importers/tests keep their stable path.
export { buildEmailHtml, renderForRecipient };
export type { CampaignRecipient };

// The two verified senders the composer offers.
export const EVENT_EMAIL_FROM_OPTIONS = [
  { value: "Founder Festival <hello@festival.so>", label: "hello@festival.so" },
  { value: "DROdio <drodio@festival.so>", label: "drodio@festival.so" },
] as const;

export function isAllowedFrom(value: string): boolean {
  return EVENT_EMAIL_FROM_OPTIONS.some((o) => o.value === value);
}

// Best-effort: record a sent member-facing email so it shows on /account and the
// campaign drill-down. NEVER throws — a logging failure must not fail the send.
export async function logMemberMessage(entry: {
  campaignId?: string | null;
  clerkUserId?: string | null;
  toEvaluationId?: string | null;
  toEmail: string;
  fromAddress: string;
  type: string;
  subject: string;
  body: string;
  eventId?: string | null;
}): Promise<void> {
  try {
    await db.insert(memberMessages).values({
      campaignId: entry.campaignId ?? null,
      clerkUserId: entry.clerkUserId ?? null,
      toEvaluationId: entry.toEvaluationId ?? null,
      toEmail: entry.toEmail,
      fromAddress: entry.fromAddress,
      type: entry.type,
      subject: entry.subject,
      body: entry.body,
      eventId: entry.eventId ?? null,
    });
  } catch (err) {
    console.error("[event-email] logMemberMessage failed", err);
  }
}

function baseUrlFromEnv(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://festival.so").replace(/\/+$/, "");
}

// Map an EventForVars off a full events row.
function eventForVars(ev: typeof events.$inferSelect, attendeeCount: number): EventForVars {
  return {
    title: ev.title,
    descriptionHtml: ev.description ?? null,
    slug: ev.slug,
    startsAt: ev.startsAt,
    venue: ev.venue ?? null,
    attendeeCount,
  };
}

// Which of these clerk users have OPTED OUT of event-logistics email. Unknown /
// unclaimed recipients (no clerk id) are never opted out (no account to set it).
async function optedOutClerkIds(clerkIds: string[]): Promise<Set<string>> {
  if (clerkIds.length === 0) return new Set();
  const rows = await db
    .select({ clerkUserId: users.clerkUserId, pref: users.prefEmailEventLogistics })
    .from(users)
    .where(inArray(users.clerkUserId, clerkIds));
  return new Set(rows.filter((r) => r.pref === false).map((r) => r.clerkUserId));
}

// Send a composed campaign now (also used by the cron for scheduled ones).
// Re-resolves event + personalized learnings, renders per recipient, applies the
// opt-out, sends, logs each, and marks the campaign sent. Per-recipient errors
// are isolated. Returns counts.
export async function sendEventCampaign(
  campaignId: string,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const [campaign] = await db
    .select()
    .from(messageCampaigns)
    .where(eq(messageCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return { sent: 0, skipped: 0, failed: 0 };

  await db.update(messageCampaigns).set({ status: "sending" }).where(eq(messageCampaigns.id, campaignId));

  const recipients = (campaign.recipients ?? []) as CampaignRecipient[];
  const baseUrl = baseUrlFromEnv();
  // Same BCC on every per-recipient send (the BCC inbox gets a full audit trail).
  const bcc = parseBccList(campaign.bccAddress);

  let event: EventForVars | null = null;
  let personalized: Record<string, { html: string }> = {};
  let connections: Record<string, { html: string }> = {};
  if (campaign.eventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, campaign.eventId)).limit(1);
    if (ev) {
      // Attendee count for {{attendee-count}} — best-effort approximate via the
      // recipient list size (admins send to the attendee set).
      event = eventForVars(ev, recipients.length);
      personalized = await getStoredPersonalizedForEvent(campaign.eventId).catch(() => ({}));
      connections = await getStoredConnectionsForEvent(campaign.eventId).catch(() => ({}));
    }
  }

  const optedOut = await optedOutClerkIds(
    recipients.map((r) => r.clerkUserId).filter((x): x is string => !!x),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of recipients) {
    if (!r.toEmail || !isValidApplicantEmail(r.toEmail)) {
      skipped++;
      continue;
    }
    if (r.clerkUserId && optedOut.has(r.clerkUserId)) {
      skipped++;
      continue;
    }
    const evForVars: EventForVars = event ?? {
      title: "",
      descriptionHtml: null,
      slug: "",
      startsAt: new Date(0),
      venue: null,
      attendeeCount: recipients.length,
    };
    const personalizedHtml = r.evaluationId ? personalized[r.evaluationId]?.html ?? null : null;
    const connectionsHtml = r.evaluationId ? connections[r.evaluationId]?.html ?? null : null;
    const rendered = renderForRecipient({
      subjectTemplate: campaign.subjectTemplate,
      bodyTemplate: campaign.bodyTemplate,
      signatureText: campaign.signatureText ?? "",
      recipient: r,
      event: evForVars,
      personalizedHtml,
      connectionsHtml,
      baseUrl,
    });
    try {
      await sendRawEmailWithoutSignature({
        from: campaign.fromAddress,
        to: r.toEmail,
        ...(bcc.length ? { bcc } : {}),
        subject: rendered.subject,
        html: rendered.html,
      });
      await logMemberMessage({
        campaignId: campaign.id,
        clerkUserId: r.clerkUserId,
        toEvaluationId: r.evaluationId,
        toEmail: r.toEmail,
        fromAddress: campaign.fromAddress,
        type: "event_blast",
        subject: rendered.subject,
        body: rendered.bodyText,
        eventId: campaign.eventId,
      });
      sent++;
    } catch (err) {
      console.error("[event-email] send failed for", r.toEmail, err);
      failed++;
    }
  }

  await db
    .update(messageCampaigns)
    .set({ status: failed > 0 && sent === 0 ? "failed" : "sent", sentAt: new Date() })
    .where(eq(messageCampaigns.id, campaignId));

  return { sent, skipped, failed };
}

// Drain due scheduled campaigns — the cron entry point. Finds campaigns whose
// scheduled time has passed and that are still `scheduled`, then runs each
// through the same send path as send-now. Per-campaign errors are isolated so one
// bad campaign can't stall the rest. Returns a per-campaign result summary.
export async function drainScheduledCampaigns(
  now: Date = new Date(),
): Promise<Array<{ id: string; sent: number; skipped: number; failed: number }>> {
  // Atomically CLAIM due campaigns (scheduled → sending) so an overlapping tick
  // can't double-send a slow campaign. Only rows still `scheduled` flip, and we
  // own exactly the ids returned.
  const ids = (
    await db
      .select({ id: messageCampaigns.id })
      .from(messageCampaigns)
      .where(and(eq(messageCampaigns.status, "scheduled"), lte(messageCampaigns.scheduledFor, now)))
      .orderBy(messageCampaigns.scheduledFor)
      .limit(25) // cap per tick; the next minute's tick picks up any remainder
  ).map((r) => r.id);

  const claimed: string[] = [];
  for (const id of ids) {
    const rows = await db
      .update(messageCampaigns)
      .set({ status: "sending" })
      .where(and(eq(messageCampaigns.id, id), eq(messageCampaigns.status, "scheduled")))
      .returning({ id: messageCampaigns.id });
    if (rows.length > 0) claimed.push(id);
  }

  const out: Array<{ id: string; sent: number; skipped: number; failed: number }> = [];
  for (const c of claimed.map((id) => ({ id }))) {
    try {
      const r = await sendEventCampaign(c.id);
      out.push({ id: c.id, ...r });
    } catch (err) {
      console.error("[event-email] scheduled send failed for campaign", c.id, err);
      // Mark failed so the tick doesn't retry it forever.
      await db
        .update(messageCampaigns)
        .set({ status: "failed" })
        .where(eq(messageCampaigns.id, c.id))
        .catch(() => {});
      out.push({ id: c.id, sent: 0, skipped: 0, failed: 1 });
    }
  }
  return out;
}

// Send a single PREVIEW to an arbitrary address — rendered for `recipient` (the
// attendee currently shown in the preview pane) but delivered to `toEmail`. NOT
// logged to anyone's account.
export async function sendPreviewEmail(opts: {
  toEmail: string;
  fromAddress: string;
  subjectTemplate: string;
  bodyTemplate: string;
  signatureText: string;
  recipient: CampaignRecipient;
  eventId: string | null;
}): Promise<void> {
  const baseUrl = baseUrlFromEnv();
  let event: EventForVars = {
    title: "",
    descriptionHtml: null,
    slug: "",
    startsAt: new Date(0),
    venue: null,
    attendeeCount: 0,
  };
  let personalizedHtml: string | null = null;
  let connectionsHtml: string | null = null;
  if (opts.eventId) {
    const [ev] = await db.select().from(events).where(eq(events.id, opts.eventId)).limit(1);
    if (ev) event = eventForVars(ev, 0);
    if (opts.recipient.evaluationId) {
      const map: Record<string, { html: string }> = await getStoredPersonalizedForEvent(
        opts.eventId,
      ).catch(() => ({}));
      personalizedHtml = map[opts.recipient.evaluationId]?.html ?? null;
      const cmap: Record<string, { html: string }> = await getStoredConnectionsForEvent(
        opts.eventId,
      ).catch(() => ({}));
      connectionsHtml = cmap[opts.recipient.evaluationId]?.html ?? null;
    }
  }
  const rendered = renderForRecipient({
    subjectTemplate: opts.subjectTemplate,
    bodyTemplate: opts.bodyTemplate,
    signatureText: opts.signatureText,
    recipient: opts.recipient,
    event,
    personalizedHtml,
    connectionsHtml,
    baseUrl,
  });
  await sendRawEmailWithoutSignature({
    from: opts.fromAddress,
    to: opts.toEmail,
    subject: `[Preview] ${rendered.subject}`,
    html: rendered.html,
  });
}

// Resolve the recipient's evaluation → clerkUserId for opt-out + account linkage
// at compose time. Used by the API when building the recipients snapshot.
export async function resolveClerkIdsForEvaluations(
  evaluationIds: string[],
): Promise<Map<string, string>> {
  const ids = evaluationIds.filter(Boolean);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ evaluationId: users.evaluationId, clerkUserId: users.clerkUserId })
    .from(users)
    .where(and(inArray(users.evaluationId, ids), eq(users.matchConfidence, "high")));
  const out = new Map<string, string>();
  for (const r of rows) if (r.evaluationId) out.set(r.evaluationId, r.clerkUserId);
  return out;
}

// Create a campaign row from compose input. Resolves each recipient's clerk id
// (for opt-out + account linkage), snapshots the recipient list, and sets the
// status: `scheduled` when `scheduledFor` is in the future, else `sending` (the
// caller then runs sendEventCampaign inline). Returns the new campaign id.
export async function createEventCampaign(opts: {
  eventId: string | null;
  createdByClerkUserId: string;
  channel: string;
  fromAddress: string;
  subjectTemplate: string;
  bodyTemplate: string;
  signatureText: string;
  bccAddress?: string | null;
  recipients: CampaignRecipient[];
  scheduledFor: Date | null;
}): Promise<{ id: string; scheduled: boolean }> {
  // Fill in clerk ids for any matched recipients missing one.
  const needIds = opts.recipients.filter((r) => !r.clerkUserId && r.evaluationId).map((r) => r.evaluationId!);
  const clerkByEval = await resolveClerkIdsForEvaluations(needIds);
  const recipients = opts.recipients.map((r) => ({
    ...r,
    clerkUserId: r.clerkUserId ?? (r.evaluationId ? clerkByEval.get(r.evaluationId) ?? null : null),
  }));

  const scheduled = !!opts.scheduledFor && opts.scheduledFor.getTime() > Date.now();
  const [row] = await db
    .insert(messageCampaigns)
    .values({
      eventId: opts.eventId,
      createdByClerkUserId: opts.createdByClerkUserId,
      channel: opts.channel,
      fromAddress: opts.fromAddress,
      subjectTemplate: opts.subjectTemplate,
      bodyTemplate: opts.bodyTemplate,
      signatureText: opts.signatureText,
      // Normalize to a comma-joined string of valid addresses (or null).
      bccAddress: parseBccList(opts.bccAddress).join(", ") || null,
      recipients,
      recipientCount: recipients.length,
      scheduledFor: opts.scheduledFor,
      status: scheduled ? "scheduled" : "sending",
    })
    .returning({ id: messageCampaigns.id });
  return { id: row!.id, scheduled };
}

export type CampaignSummary = {
  id: string;
  channel: string;
  fromAddress: string;
  subjectTemplate: string;
  recipientCount: number;
  // "12 attendees" for a blast, or the single person's name for a 1:1 send.
  sentToLabel: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
};

// Past communications for an event's "Emails & Texts" table, newest first.
// Deploy-safe: returns [] if the table isn't present yet (so the admin event page
// never 500s when this ships ahead of migration 0060).
export async function listEventCampaigns(eventId: string): Promise<CampaignSummary[]> {
  let rows;
  try {
    rows = await db
      .select({
        id: messageCampaigns.id,
        channel: messageCampaigns.channel,
        fromAddress: messageCampaigns.fromAddress,
        subjectTemplate: messageCampaigns.subjectTemplate,
        recipientCount: messageCampaigns.recipientCount,
        recipients: messageCampaigns.recipients,
        status: messageCampaigns.status,
        scheduledFor: messageCampaigns.scheduledFor,
        sentAt: messageCampaigns.sentAt,
        createdAt: messageCampaigns.createdAt,
      })
      .from(messageCampaigns)
      .where(eq(messageCampaigns.eventId, eventId))
      .orderBy(desc(messageCampaigns.createdAt));
  } catch {
    return [];
  }
  return rows.map((r) => {
    const recips = (r.recipients ?? []) as CampaignRecipient[];
    const sentToLabel =
      r.recipientCount === 1
        ? recips[0]?.fullName?.trim() || recips[0]?.toEmail || "1 attendee"
        : `${r.recipientCount} attendees`;
    return {
      id: r.id,
      channel: r.channel,
      fromAddress: r.fromAddress,
      subjectTemplate: r.subjectTemplate,
      recipientCount: r.recipientCount,
      sentToLabel,
      status: r.status,
      scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// One campaign's detail + its per-recipient sent rows (the drill-down).
export async function getEventCampaignDetail(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(messageCampaigns)
    .where(eq(messageCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return null;
  const recipients = await db
    .select({
      toEmail: memberMessages.toEmail,
      subject: memberMessages.subject,
      body: memberMessages.body,
      sentAt: memberMessages.sentAt,
    })
    .from(memberMessages)
    .where(eq(memberMessages.campaignId, campaignId))
    .orderBy(desc(memberMessages.sentAt));
  return { campaign, recipients };
}
