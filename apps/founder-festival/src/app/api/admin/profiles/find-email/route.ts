// POST /api/admin/profiles/find-email
//
// Body: { evaluationIds: string[] }
// QUEUES the selected eligible profiles for an email lookup — it does NOT call
// AnyMailFinder inline (real lookups average ~6s each, so hundreds would blow past
// the function timeout). The /api/cron/find-email-tick cron drains the queue with
// concurrency. Eligible = unclaimed, no found_email, not previously attempted
// (found_email_status null), and not already queued. Charging happens in the cron;
// `find_email_billable` is captured here (false for super-admins) so it stays correct.
//
// Returns: { queued: number }  (how many rows were newly enqueued)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { adminGate, isSuperAdmin } from "@/lib/admin";
import { can } from "@/lib/grants";

export const dynamic = "force-dynamic";

type Body = { evaluationIds?: unknown };

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Find Email spends credits → gate behind the same capability as bulk scoring.
  if (!(await can("run_scoring_jobs"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.evaluationIds)
    ? Array.from(new Set(body.evaluationIds.filter((x): x is string => typeof x === "string")))
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "no_ids" }, { status: 400 });

  // Eligibility (server-side; never trust the client's selection): selected evals
  // with no found_email, not previously attempted, and not already queued.
  const candidates = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(
      and(
        inArray(evaluations.id, ids),
        isNull(evaluations.foundEmail),
        isNull(evaluations.foundEmailStatus),
        isNull(evaluations.findEmailQueuedAt),
      ),
    );

  // ...minus CLAIMED profiles. NOTE: this is a SPEND optimization ("don't pay to
  // find an email for someone who already claimed"), NOT the mutation-ownership
  // gate — so it deliberately counts BOTH high and medium (name-only) claims.
  // Do not swap in isOwningConfidence here; that would start paying to look up
  // emails for name-only claimers.
  const claimedRows = await db
    .select({ evaluationId: users.evaluationId, matchConfidence: users.matchConfidence })
    .from(users)
    .where(inArray(users.evaluationId, ids));
  const claimed = new Set(
    claimedRows
      .filter((c) => c.evaluationId && (c.matchConfidence === "high" || c.matchConfidence === "medium"))
      .map((c) => c.evaluationId as string),
  );

  const eligibleIds = candidates.map((c) => c.id).filter((id) => !claimed.has(id));
  if (eligibleIds.length === 0) return NextResponse.json({ queued: 0 });

  // Capture the charge decision NOW (the cron runs later, without this session).
  const billable = !(await isSuperAdmin());

  await db
    .update(evaluations)
    .set({ findEmailQueuedAt: new Date(), findEmailQueuedBy: userId, findEmailBillable: billable })
    .where(inArray(evaluations.id, eligibleIds));

  // Return the ids so the client can poll /find-email/status for exactly these rows.
  return NextResponse.json({ queued: eligibleIds.length, queuedIds: eligibleIds });
}
