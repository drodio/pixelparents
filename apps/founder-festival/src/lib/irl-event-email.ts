import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, recommendationResponses, recommendationVisibility } from "@/db/schema";
import { sendRawEmail } from "@/lib/email";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";

// Trailing-debounce window: how long to wait for the answering session to settle
// before sending the single summary email. A burst of rating clicks lands well
// within this; only the LAST one (no newer answer during its window) sends.
const DEBOUNCE_MS = 30_000;

// Mirror of the rating widget's labels (1..4). Kept here (not imported from the
// client Recommendations component) to avoid dragging client code server-side.
const RATING_LABELS = ["Unlikely", "Possibly", "Probably", "Definitely"] as const;
const NOTIFY_TO = "DROdio@festival.so";
const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";

type RecItem = { id: string; text: string };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Notify DROdio whenever someone answers the IRL-event ("Would you attend these
// IRL festival events?") questions. Sends a full snapshot of that person's
// current answers (description + Unlikely..Definitely score + public/private).
// Best-effort: swallows all errors so it can never break the rating save.
export async function sendIrlEventAnswerEmail(evaluationId: string, origin: string): Promise<void> {
  try {
    const [ev] = await db
      .select({ fullName: evaluations.fullName, score: evaluations.score, recommendations: evaluations.recommendations })
      .from(evaluations)
      .where(eq(evaluations.id, evaluationId))
      .limit(1);
    if (!ev) return;

    const [responses, privacyRows] = await Promise.all([
      db
        .select({ itemId: recommendationResponses.itemId, rating: recommendationResponses.rating, editedText: recommendationResponses.editedText })
        .from(recommendationResponses)
        .where(eq(recommendationResponses.evaluationId, evaluationId)),
      db
        .select({ itemId: recommendationVisibility.itemId })
        .from(recommendationVisibility)
        .where(eq(recommendationVisibility.evaluationId, evaluationId)),
    ]);
    if (responses.length === 0) return;

    const privateIds = new Set(privacyRows.map((p) => p.itemId));
    const items = ((ev.recommendations as { items?: RecItem[] } | null)?.items ?? []) as RecItem[];
    const descFor = (itemId: string, edited: string | null) =>
      (edited?.trim() || items.find((i) => i.id === itemId)?.text || "(untitled priority)").trim();

    const fullName = (ev.fullName ?? "Someone").trim();
    const score = ev.score;
    const path = await canonicalProfileUrl(evaluationId);
    const profileUrl = path ? `${origin}${path}` : origin;

    const eventsHtml = responses
      .map((r) => {
        const desc = descFor(r.itemId, r.editedText);
        const label = RATING_LABELS[(r.rating ?? 1) - 1] ?? String(r.rating);
        const vis = privateIds.has(r.itemId) ? "Private" : "Public";
        return `<p style="margin:0 0 14px"><strong>${esc(desc)}</strong><br/>Score: ${esc(label)}<br/>Visibility: ${vis}</p>`;
      })
      .join("");

    const subject = `${fullName} ${score} answered IRL event questions`;
    const html = [
      `<p><strong>${esc(fullName)} ${score}</strong>: <a href="${profileUrl}">${profileUrl}</a></p>`,
      `<p>Has requested these IRL Festival events:</p>`,
      eventsHtml,
    ].join("\n");

    await sendRawEmail({ from: FROM, to: NOTIFY_TO, subject, html });
  } catch (e) {
    console.error("sendIrlEventAnswerEmail failed (non-fatal):", e);
  }
}

// Latest answer time for an eval — the debounce uses it to detect whether a newer
// answer arrived during the wait. 0 when there are no answers.
async function maxAnswerTime(evaluationId: string): Promise<number> {
  const [row] = await db
    .select({ m: sql<string | null>`max(${recommendationResponses.updatedAt})` })
    .from(recommendationResponses)
    .where(eq(recommendationResponses.evaluationId, evaluationId));
  return row?.m ? new Date(row.m).getTime() : 0;
}

// Coalesce a burst of answers into ONE email per session. Runs inside the route's
// `after()` (post-response): snapshot the latest-answer time, wait DEBOUNCE_MS,
// and bail if a newer answer landed meanwhile (that newer save's run will send).
// Only the final, settled save sends — with the complete snapshot.
export async function sendIrlEventAnswerEmailDebounced(evaluationId: string, origin: string): Promise<void> {
  try {
    const before = await maxAnswerTime(evaluationId);
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const after = await maxAnswerTime(evaluationId);
    if (after !== before) return; // a newer answer arrived; its own run will send.
    await sendIrlEventAnswerEmail(evaluationId, origin);
  } catch (e) {
    console.error("sendIrlEventAnswerEmailDebounced failed (non-fatal):", e);
  }
}
