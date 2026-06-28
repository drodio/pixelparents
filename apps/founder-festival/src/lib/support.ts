import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { supportTickets, supportTicketMessages } from "@/db/schema";
import { sendRawEmail } from "@/lib/email";

// Support tickets: filed from /docs/support by claimed users, answered in-app
// with Resend email pings both directions (no inbound MX). See the design spec.

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so").replace(/\/$/, "");
const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";
const SUPPORT_INBOX = "drodio@festival.so";

export type SupportTicket = {
  id: string;
  evaluationId: string;
  clerkUserId: string | null;
  email: string | null;
  subject: string;
  status: string; // 'open' | 'closed'
  createdAt: string;
  updatedAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorType: string; // 'user' | 'admin'
  body: string;
  createdAt: string;
};

// A ticket plus a derived flag: has the Founder Festival team replied yet?
export type SupportTicketWithReply = SupportTicket & { adminReplied: boolean };

// User-facing status label. The raw DB status is just open|closed; for the
// person who filed the ticket we want clearer wording:
//   - closed                → "Closed"
//   - open, no admin reply   → "Pending"   (waiting on us)
//   - open, admin has replied→ "Responded"
export type UserTicketStatus = "pending" | "responded" | "closed";
export function userTicketStatus(status: string, adminReplied: boolean): UserTicketStatus {
  if (status === "closed") return "closed";
  return adminReplied ? "responded" : "pending";
}
export function userTicketLabel(status: string, adminReplied: boolean): string {
  const s = userTicketStatus(status, adminReplied);
  return s === "closed" ? "Closed" : s === "responded" ? "Responded" : "Pending";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// First non-empty line, trimmed to 80 chars; fallback to a generic subject.
function deriveSubject(body: string): string {
  const first = body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (!first) return "Support request";
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
}

function toTicket(r: typeof supportTickets.$inferSelect): SupportTicket {
  return {
    id: r.id,
    evaluationId: r.evaluationId,
    clerkUserId: r.clerkUserId,
    email: r.email,
    subject: r.subject,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toMessage(r: typeof supportTicketMessages.$inferSelect): SupportMessage {
  return {
    id: r.id,
    ticketId: r.ticketId,
    authorType: r.authorType,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function createTicket(args: {
  evaluationId: string;
  clerkUserId: string | null;
  email: string | null;
  body: string;
}): Promise<SupportTicket> {
  const subject = deriveSubject(args.body);
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      evaluationId: args.evaluationId,
      clerkUserId: args.clerkUserId,
      email: args.email,
      subject,
    })
    .returning();
  await db.insert(supportTicketMessages).values({
    ticketId: ticket!.id,
    authorType: "user",
    body: args.body,
  });
  return toTicket(ticket!);
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return row ? toTicket(row) : null;
}

export async function listMyTickets(evaluationId: string): Promise<SupportTicketWithReply[]> {
  const rows = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.evaluationId, evaluationId))
    .orderBy(desc(supportTickets.updatedAt));
  if (rows.length === 0) return [];

  // Which of these tickets has at least one admin reply? (drives Pending vs
  // Responded on the user's list).
  const replied = await db
    .selectDistinct({ ticketId: supportTicketMessages.ticketId })
    .from(supportTicketMessages)
    .where(
      and(
        inArray(supportTicketMessages.ticketId, rows.map((r) => r.id)),
        eq(supportTicketMessages.authorType, "admin"),
      ),
    );
  const repliedSet = new Set(replied.map((r) => r.ticketId));
  return rows.map((r) => ({ ...toTicket(r), adminReplied: repliedSet.has(r.id) }));
}

// All tickets for the admin console: open first, then most-recently-updated.
export async function listAllTickets(): Promise<SupportTicket[]> {
  const rows = await db
    .select()
    .from(supportTickets)
    .orderBy(
      sql`case when ${supportTickets.status} = 'open' then 0 else 1 end`,
      desc(supportTickets.updatedAt),
    );
  return rows.map(toTicket);
}

export async function listMessages(ticketId: string): Promise<SupportMessage[]> {
  const rows = await db
    .select()
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.ticketId, ticketId))
    .orderBy(supportTicketMessages.createdAt);
  return rows.map(toMessage);
}

export async function addMessage(
  ticketId: string,
  authorType: "user" | "admin",
  body: string,
): Promise<SupportMessage> {
  const [msg] = await db
    .insert(supportTicketMessages)
    .values({ ticketId, authorType, body })
    .returning();
  await db.update(supportTickets).set({ updatedAt: sql`now()` }).where(eq(supportTickets.id, ticketId));
  return toMessage(msg!);
}

export async function setStatus(ticketId: string, status: "open" | "closed"): Promise<boolean> {
  const rows = await db
    .update(supportTickets)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(supportTickets.id, ticketId))
    .returning({ id: supportTickets.id });
  return rows.length > 0;
}

// Count of open tickets — for the admin nav badge.
export async function openTicketCount(): Promise<number> {
  const rows = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(eq(supportTickets.status, "open"));
  return rows.length;
}

// ── Email notifications (best-effort; never throw into the request path) ──────
function adminLink(id: string): string {
  return `${SITE}/admin/support/${id}`;
}
function userLink(id: string): string {
  return `${SITE}/docs/support/${id}`;
}

export async function emailAdminNewTicket(ticket: SupportTicket, body: string): Promise<void> {
  await sendRawEmail({
    from: FROM,
    to: SUPPORT_INBOX,
    replyTo: ticket.email ?? undefined,
    subject: `[Support] ${ticket.subject}`,
    html: `<p>New support ticket from <strong>${escapeHtml(ticket.email ?? "a member")}</strong>:</p>
<blockquote style="border-left:3px solid #dfa43a;padding-left:12px;color:#444;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
<p><a href="${adminLink(ticket.id)}">Open & respond →</a></p>`,
  }).catch(() => {});
}

// Confirmation to the filer right after they open a ticket, with the link to
// their thread so they can find it later (and reply by email-prompted return).
export async function emailUserTicketCreated(ticket: SupportTicket, body: string): Promise<void> {
  if (!ticket.email) return;
  await sendRawEmail({
    from: FROM,
    to: ticket.email,
    subject: `We got your support request: ${ticket.subject}`,
    html: `<p>Thanks for reaching out to Founder Festival. We&apos;ve received your support request and will reply by email and here in your ticket:</p>
<blockquote style="border-left:3px solid #dfa43a;padding-left:12px;color:#444;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
<p><a href="${userLink(ticket.id)}">View your ticket →</a></p>`,
  }).catch(() => {});
}

// Ping the admin inbox when a filer reopens a previously-closed ticket.
export async function emailAdminReopened(ticket: SupportTicket): Promise<void> {
  await sendRawEmail({
    from: FROM,
    to: SUPPORT_INBOX,
    replyTo: ticket.email ?? undefined,
    subject: `Reopened: [Support] ${ticket.subject}`,
    html: `<p><strong>${escapeHtml(ticket.email ?? "A member")}</strong> reopened a support ticket they felt wasn&apos;t fully resolved.</p>
<p><a href="${adminLink(ticket.id)}">Open & respond →</a></p>`,
  }).catch(() => {});
}

export async function emailUserReply(ticket: SupportTicket, body: string): Promise<void> {
  if (!ticket.email) return;
  await sendRawEmail({
    from: FROM,
    to: ticket.email,
    subject: `Re: ${ticket.subject}`,
    html: `<p>You have a new reply on your Founder Festival support ticket:</p>
<blockquote style="border-left:3px solid #dfa43a;padding-left:12px;color:#444;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
<p><a href="${userLink(ticket.id)}">View & reply →</a></p>`,
  }).catch(() => {});
}

export async function emailAdminUserReply(ticket: SupportTicket, body: string): Promise<void> {
  await sendRawEmail({
    from: FROM,
    to: SUPPORT_INBOX,
    replyTo: ticket.email ?? undefined,
    subject: `Re: [Support] ${ticket.subject}`,
    html: `<p>New reply from <strong>${escapeHtml(ticket.email ?? "a member")}</strong>:</p>
<blockquote style="border-left:3px solid #dfa43a;padding-left:12px;color:#444;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
<p><a href="${adminLink(ticket.id)}">Open & respond →</a></p>`,
  }).catch(() => {});
}
