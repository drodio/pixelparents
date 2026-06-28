import { clerkClient } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { sentEmails, users } from "@/db/schema";
import { sendRawEmail } from "@/lib/email";
import { parseMentionedIds, rewriteMentionNames } from "@/lib/event-chat-shared";
import { preferredNamesForEvals } from "@/lib/preferred-name";

const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";
const BASE = "https://festival.so";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Reduce @[Name](evalId) mention markers to just the name, for plain display.
function stripMentions(s: string): string {
  return s.replace(/@\[([^\]]+)\]\([^)]*\)/g, "$1");
}

// First name for the greeting: the claimer's nickname, else Clerk firstName's
// first token, else "there".
function greetingName(nickname: string | null | undefined, clerkFirstName: string | null | undefined): string {
  const n = nickname?.trim();
  if (n) return n;
  return clerkFirstName?.trim().split(/\s+/)[0] || "there";
}

// Pure builder for the mention email (no send) so the copy is unit-testable.
// Names/title/body are user-supplied → escaped; mention markers reduced to
// plain names. eventUrl/permalinkUrl are app-built → trusted. The DROdio
// signature is appended by the send layer, not here.
export function buildMentionEmail(opts: {
  firstName: string;
  authorName: string;
  eventTitle: string;
  eventUrl: string;
  threadTitle: string;
  chatBody: string;
  permalinkUrl: string;
}): { subject: string; html: string } {
  const title = stripMentions(opts.threadTitle).trim();
  const subject = `${opts.authorName} just mentioned you on ${title}`;
  const html = `
            <p>${escapeHtml(opts.firstName)},</p>
            <p><strong>${escapeHtml(opts.authorName)}</strong> just mentioned you in a chat from <a href="${opts.eventUrl}">${escapeHtml(opts.eventTitle)}</a>:</p>
            <p><strong>${escapeHtml(title)}</strong><br>${escapeHtml(stripMentions(opts.chatBody).trim()).replace(/\n/g, "<br>")}</p>
            <p>You can <a href="${opts.permalinkUrl}">reply or upvote the thread here</a>.</p>
          `;
  return { subject, html };
}

// Email the CLAIMED members mentioned in a chat thread/comment, once each, with
// the post and a link to reply/upvote. Best-effort: never throws into the
// request path. Deduped per (recipient, source post) via sent_emails so
// re-renders/edits don't re-notify. Only claimed profiles (users row) are
// emailed. The DROdio signature is appended automatically by the send layer.
export async function sendMentionEmails(opts: {
  eventTitle: string;
  // Path to the event page; the email links [event title] here.
  eventPath: string;
  // The thread's title (used in the subject + shown). May contain mention markers.
  threadTitle: string;
  // The post body — the thread body, or the reply text. May contain markers.
  chatBody: string;
  // The post being created — its id is the dedup key (so each post notifies a
  // given member at most once).
  sourceId: string;
  // Path to link to (absolute URL built from BASE), e.g.
  // /events/<slug>/chat/<threadId> or .../<threadId>#c-<commentId>.
  permalinkPath: string;
  mentionedEvalIds: string[];
  authorName: string;
  authorEvalId: string;
}): Promise<void> {
  try {
    // Note: we deliberately do NOT exclude the author — a member who @mentions
    // themselves DOES get the email (per product decision). Dedup still prevents
    // more than one email per (recipient, post).
    const targets = opts.mentionedEvalIds.filter((id) => !!id);
    if (targets.length === 0) return;

    // Only claimed members (users row exists for their evaluation) get email.
    const rows = await db
      .select({ evalId: users.evaluationId, clerkUserId: users.clerkUserId, nickname: users.nickname })
      .from(users)
      .where(inArray(users.evaluationId, targets));
    if (rows.length === 0) return;

    const url = `${BASE}${opts.permalinkPath}`;
    const eventUrl = `${BASE}${opts.eventPath}`;
    const kind = `chat_mention:${opts.sourceId}`;
    const clerk = await clerkClient();

    // Re-resolve names baked into @[Name](evalId) markers to current preferred
    // names (nickname when set), so the email subject/body show e.g. "DROdio"
    // rather than the full name typed at mention time.
    const refIds = [...parseMentionedIds(opts.threadTitle), ...parseMentionedIds(opts.chatBody)];
    const nameMap = await preferredNamesForEvals(refIds);
    const threadTitle = rewriteMentionNames(opts.threadTitle, nameMap);
    const chatBody = rewriteMentionNames(opts.chatBody, nameMap);

    for (const r of rows) {
      if (!r.clerkUserId) continue;
      // Atomic dedup: insert the marker; if it conflicts (already sent), skip.
      const inserted = await db
        .insert(sentEmails)
        .values({ clerkUserId: r.clerkUserId, kind })
        .onConflictDoNothing()
        .returning({ id: sentEmails.id });
      if (inserted.length === 0) continue;

      let email: string | null = null;
      let clerkFirst: string | null = null;
      try {
        const u = await clerk.users.getUser(r.clerkUserId);
        email =
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u.emailAddresses[0]?.emailAddress ??
          null;
        clerkFirst = u.firstName ?? null;
      } catch {
        email = null;
      }
      if (!email) continue;

      const { subject, html } = buildMentionEmail({
        firstName: greetingName(r.nickname, clerkFirst),
        authorName: opts.authorName,
        eventTitle: opts.eventTitle,
        eventUrl,
        threadTitle,
        chatBody,
        permalinkUrl: url,
      });

      try {
        await sendRawEmail({ from: FROM, to: email, subject, html });
      } catch {
        // swallow — the dedup row already recorded the attempt
      }
    }
  } catch {
    // best-effort; never throw into the request path
  }
}
