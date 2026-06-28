import { clerkClient } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { endorsements, evaluations, sentEmails, users } from "@/db/schema";
import { sendRawEmail } from "@/lib/email";
import { logMemberMessage } from "@/lib/event-email-send";
import { canViewAtVisibility, isVisibility, type Visibility } from "@/lib/endorsement-constants";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";

const FROM = "Founder Festival <hello@festival.so>";
const BASE = "https://festival.so";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Display name preferring the claimer's nickname over the eval's full name.
async function displayName(evalId: string): Promise<string> {
  const [ev] = await db
    .select({ fullName: evaluations.fullName })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  const [u] = await db
    .select({ nickname: users.nickname })
    .from(users)
    .where(and(eq(users.evaluationId, evalId), eq(users.matchConfidence, "high")))
    .limit(1);
  return u?.nickname?.trim() || ev?.fullName?.trim() || "A member";
}

// Notify a CLAIMED endorsee that they were endorsed. Best-effort — never throws
// into the request path. Skips PRIVATE endorsements (visible only to the author,
// so notifying the subject would leak them). The points clause is included only
// when the endorsee is allowed to see the points (public / members_only points).
// Deduped: one email per endorsement (so edits / re-saves don't re-notify).
export async function sendEndorsementEmail(endorsementId: string): Promise<void> {
  try {
    const [e] = await db
      .select({
        toEvalId: endorsements.evaluationId,
        fromEvalId: endorsements.fromEvaluationId,
        body: endorsements.body,
        visibility: endorsements.visibility,
        points: endorsements.points,
        pointsVisibility: endorsements.pointsVisibility,
      })
      .from(endorsements)
      .where(eq(endorsements.id, endorsementId))
      .limit(1);
    if (!e) return;
    const vis: Visibility = isVisibility(e.visibility) ? e.visibility : "public";
    if (vis === "private") return; // never notify the subject of a private endorsement

    // Endorsee must be a claimed member.
    const [endorsee] = await db
      .select({ clerkUserId: users.clerkUserId, nickname: users.nickname })
      .from(users)
      .where(and(eq(users.evaluationId, e.toEvalId), eq(users.matchConfidence, "high")))
      .limit(1);
    if (!endorsee?.clerkUserId) return;

    // Dedup: one email per endorsement.
    const inserted = await db
      .insert(sentEmails)
      .values({ clerkUserId: endorsee.clerkUserId, kind: `endorsement:${endorsementId}` })
      .onConflictDoNothing()
      .returning({ id: sentEmails.id });
    if (inserted.length === 0) return;

    const clerk = await clerkClient();
    let email: string | null = null;
    let clerkFirst: string | null = null;
    try {
      const u = await clerk.users.getUser(endorsee.clerkUserId);
      email =
        u.emailAddresses.find((a) => a.id === u.primaryEmailAddressId)?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        null;
      clerkFirst = u.firstName ?? null;
    } catch {
      email = null;
    }
    if (!email) return;

    const endorserName = await displayName(e.fromEvalId);
    const firstName = (endorsee.nickname?.trim() || clerkFirst || "").trim();

    // Points clause only when the endorsee may see them (never a private amount).
    const pVis: Visibility = isVisibility(e.pointsVisibility) ? e.pointsVisibility : "public";
    const showPoints =
      e.points > 0 && canViewAtVisibility(pVis, { isMember: true, isAuthor: false });
    const pointsClause = showPoints
      ? ` with ${e.points.toLocaleString("en-US")} of their profile points`
      : "";

    // ~140-char snippet, with @[Name](id) mention markers reduced to the name.
    const plain = e.body.replace(/@\[([^\]]+)\]\([^)]*\)/g, "$1").trim();
    const snippet = plain.length > 140 ? `${plain.slice(0, 140).trimEnd()}…` : plain;

    const path = (await canonicalProfileUrl(e.toEvalId)) ?? `/profile?e=${e.toEvalId}`;
    const url = `${BASE}${path}#member-endorsements`;
    const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";

    const subject = `${endorserName} endorsed you on Founder Festival`;
    await sendRawEmail({
      from: FROM,
      to: email,
      subject,
      html: `
        <p style="font-weight:600;">🎉 You've been endorsed</p>
        <p>${greeting}</p>
        <p><strong>${escapeHtml(endorserName)}</strong> just endorsed you on Founder Festival${escapeHtml(pointsClause)}.</p>
        ${snippet ? `<p style="color:#555;font-style:italic;">&ldquo;${escapeHtml(snippet)}&rdquo;</p>` : ""}
        <p><a href="${url}">See your endorsement →</a></p>
      `,
    });
    // Surface in the recipient's /account → Messages inbox (best-effort).
    await logMemberMessage({
      clerkUserId: endorsee.clerkUserId,
      toEvaluationId: e.toEvalId,
      toEmail: email,
      fromAddress: FROM,
      type: "endorsement",
      subject,
      body: `${endorserName} just endorsed you on Founder Festival${pointsClause}.${snippet ? `\n\n"${snippet}"` : ""}\n\n${url}`,
      eventId: null,
    });
  } catch {
    // best-effort; never throw into the request path
  }
}
