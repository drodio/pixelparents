import { NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { recommendationResponses } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isEvalOwner } from "@/lib/authz";
import { isAdmin } from "@/lib/admin";
import { sendIrlEventAnswerEmailDebounced } from "@/lib/irl-event-email";

// Both handlers mutate rows tied to a specific evaluation, so the caller must
// own that evaluation (claimed it) or be an admin. Returns a NextResponse to
// short-circuit on failure, or null when the caller is authorized.
async function gate(evaluationId: string): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await isEvalOwner(userId, evaluationId)) && !(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

// POST /api/recommendations — upsert one rating row.
// Body: { evaluationId, itemId, rating (1..4), category?, text? }
//
// Pre-populated items: omit category (it lives on the eval row), omit text (we
//   keep the LLM-generated text), but DO send the rating.
// Custom items: send category + text + rating with a client-generated itemId
//   like `custom-<random>`.
export async function POST(req: Request) {
  let body: {
    evaluationId?: string;
    itemId?: string;
    rating?: number;
    category?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { evaluationId, itemId, rating, category, text } = body;
  if (!evaluationId || !itemId) {
    return NextResponse.json({ error: "evaluationId and itemId required" }, { status: 400 });
  }
  if (typeof rating !== "number" || rating < 1 || rating > 4) {
    return NextResponse.json({ error: "rating must be 1..4" }, { status: 400 });
  }
  const denied = await gate(evaluationId);
  if (denied) return denied;

  await db
    .insert(recommendationResponses)
    .values({
      evaluationId,
      itemId,
      rating,
      category: category ?? null,
      editedText: text ?? null,
    })
    .onConflictDoUpdate({
      target: [recommendationResponses.evaluationId, recommendationResponses.itemId],
      set: {
        rating,
        category: category ?? null,
        editedText: text ?? null,
        updatedAt: sql`NOW()`,
      },
    });

  // Notify DROdio that someone answered the IRL-event questions — ONE email per
  // answering session. Runs AFTER the response (next/server `after`) so it never
  // slows the rating save; the debounce coalesces a burst of ratings; it's
  // self-catching so a mail failure can't break anything.
  const origin = new URL(req.url).origin;
  after(() => sendIrlEventAnswerEmailDebounced(evaluationId, origin));

  return NextResponse.json({ ok: true });
}

// DELETE /api/recommendations — remove the rating row for one item.
// Body: { evaluationId, itemId }
export async function DELETE(req: Request) {
  let body: { evaluationId?: string; itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { evaluationId, itemId } = body;
  if (!evaluationId || !itemId) {
    return NextResponse.json({ error: "evaluationId and itemId required" }, { status: 400 });
  }
  const denied = await gate(evaluationId);
  if (denied) return denied;

  await db
    .delete(recommendationResponses)
    .where(
      and(
        eq(recommendationResponses.evaluationId, evaluationId),
        eq(recommendationResponses.itemId, itemId),
      ),
    );
  return NextResponse.json({ ok: true });
}
