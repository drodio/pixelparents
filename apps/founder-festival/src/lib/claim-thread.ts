import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { claimThreads, claimMessages } from "@/db/schema";
import { sendRawEmail, isValidApplicantEmail } from "./email";

// Pull a bare, normalized email address out of a "Name <a@b.com>" or "a@b.com"
// header value (lowercased + trimmed). Returns "" if none parses.
export function extractEmailAddress(raw: string): string {
  if (typeof raw !== "string") return "";
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
}

// Do two header values refer to the same mailbox? Both must parse to a non-empty
// address. Used to verify an inbound reply came from the person we emailed.
export function emailsMatch(a: string, b: string): boolean {
  const x = extractEmailAddress(a);
  const y = extractEmailAddress(b);
  return x !== "" && x === y;
}

// Outcome of attempting to record an inbound reply. "no_thread" / "sender_mismatch"
// are dropped by the webhook (acknowledged 200, not stored); "duplicate" means an
// at-least-once redelivery we already have.
export type InboundResult = "recorded" | "duplicate" | "no_thread" | "sender_mismatch";

// Claim Review Console — "Email User" threads. An admin composes a subject+body
// to the owner of a pending claim; we stamp a stable "(Request #NNNNN)" token
// into the subject so the user's reply can be matched back to this thread by the
// inbound webhook. Outbound + inbound messages are both persisted so the admin
// sees the full back-and-forth in the claim area.

const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";
// When set (e.g. "reply@reply.festival.so" on a subdomain whose MX points at
// Resend Inbound), user replies route to the inbound webhook instead of the
// hello@ Google Workspace mailbox. Unset → replies just go to From (no webhook).
const REPLY_TO = process.env.CLAIM_REPLY_TO;

export type ClaimMessage = {
  id: string;
  direction: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: Date;
};

// One thread per score_item, created lazily on the first outbound email.
export async function getOrCreateThread(
  scoreItemId: string,
  evaluationId: string,
): Promise<{ id: string; requestNumber: number }> {
  const [existing] = await db
    .select({ id: claimThreads.id, requestNumber: claimThreads.requestNumber })
    .from(claimThreads)
    .where(eq(claimThreads.scoreItemId, scoreItemId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(claimThreads)
    .values({ scoreItemId, evaluationId })
    .returning({ id: claimThreads.id, requestNumber: claimThreads.requestNumber });
  return created;
}

// Ensure the request token is present exactly once. If the admin's subject
// already carries "(Request #NNNNN)" we leave it; otherwise we append it.
export function stampSubject(subject: string, requestNumber: number): string {
  const token = `(Request #${requestNumber})`;
  if (parseRequestNumber(subject) === requestNumber) return subject.trim();
  const base = subject.trim() || "Your requested profile update";
  return `${base} ${token}`;
}

// Extract the request number from a (possibly "RE:"-prefixed) subject line.
export function parseRequestNumber(subject: string): number | null {
  const m = subject.match(/\(?\s*Request\s*#\s*(\d{3,})\s*\)?/i);
  return m ? Number(m[1]) : null;
}

// Compose + send an outbound email to the claim owner, persisting it on the thread.
// Returns the stored message. Throws on invalid recipient or Resend error.
export async function sendClaimUserEmail(opts: {
  scoreItemId: string;
  evaluationId: string;
  to: string;
  subject: string;
  body: string;
}): Promise<{ requestNumber: number; message: ClaimMessage }> {
  const to = opts.to.trim();
  if (!isValidApplicantEmail(to)) throw new Error("invalid recipient email");
  const thread = await getOrCreateThread(opts.scoreItemId, opts.evaluationId);
  const subject = stampSubject(opts.subject, thread.requestNumber);
  const html = bodyToHtml(opts.body);
  await sendRawEmail({ from: FROM, to, subject, html, ...(REPLY_TO ? { replyTo: REPLY_TO } : {}) });
  const fromEmail = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
  const [message] = await db
    .insert(claimMessages)
    .values({ threadId: thread.id, direction: "outbound", fromEmail, toEmail: to, subject, body: opts.body })
    .returning();
  await db.update(claimThreads).set({ updatedAt: new Date() }).where(eq(claimThreads.id, thread.id));
  return { requestNumber: thread.requestNumber, message };
}

// Store an inbound reply against the thread identified by request number.
//
// SECURITY: the request number is a short sequential token in the (public-ish)
// subject line, so being on the verified Resend Inbound channel isn't enough —
// we additionally require the reply's From address to match the address we last
// emailed on this thread. That stops one legitimate inbound sender from injecting
// a message into someone else's claim thread.
//
// IDEMPOTENCY: Svix/Resend deliver at-least-once. We dedup on providerEventId
// (the svix-id) via the unique index — a redelivery returns "duplicate" instead
// of appending a second copy.
export async function recordInboundReply(opts: {
  requestNumber: number;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  providerEventId?: string | null;
}): Promise<InboundResult> {
  const [thread] = await db
    .select({ id: claimThreads.id })
    .from(claimThreads)
    .where(eq(claimThreads.requestNumber, opts.requestNumber))
    .limit(1);
  if (!thread) return "no_thread";

  // The address we actually emailed (most recent outbound message on the thread).
  const [lastOutbound] = await db
    .select({ toEmail: claimMessages.toEmail })
    .from(claimMessages)
    .where(and(eq(claimMessages.threadId, thread.id), eq(claimMessages.direction, "outbound")))
    .orderBy(desc(claimMessages.createdAt))
    .limit(1);
  // If we have an outbound recipient on file, the reply must come from them.
  if (lastOutbound?.toEmail && !emailsMatch(opts.fromEmail, lastOutbound.toEmail)) {
    return "sender_mismatch";
  }

  const inserted = await db
    .insert(claimMessages)
    .values({
      threadId: thread.id,
      direction: "inbound",
      fromEmail: opts.fromEmail,
      toEmail: opts.toEmail,
      subject: opts.subject,
      body: opts.body,
      providerEventId: opts.providerEventId ?? null,
    })
    .onConflictDoNothing({ target: claimMessages.providerEventId })
    .returning({ id: claimMessages.id });
  if (inserted.length === 0) return "duplicate"; // redelivered event we already stored

  await db.update(claimThreads).set({ updatedAt: new Date() }).where(eq(claimThreads.id, thread.id));
  return "recorded";
}

// All messages for a claim, oldest-first, plus the thread's request number.
export async function getThreadForItem(
  scoreItemId: string,
): Promise<{ requestNumber: number; messages: ClaimMessage[] } | null> {
  const [thread] = await db
    .select({ id: claimThreads.id, requestNumber: claimThreads.requestNumber })
    .from(claimThreads)
    .where(eq(claimThreads.scoreItemId, scoreItemId))
    .limit(1);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(claimMessages)
    .where(eq(claimMessages.threadId, thread.id))
    .orderBy(asc(claimMessages.createdAt));
  return { requestNumber: thread.requestNumber, messages };
}

// Render an admin-typed plain-text body to safe HTML (escape, then \n → <br/>).
function bodyToHtml(body: string): string {
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<div>${esc.replace(/\r?\n/g, "<br/>")}</div>`;
}
