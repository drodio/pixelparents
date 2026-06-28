import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  scoringJobs,
  scoringJobItems,
  evaluations,
  events as eventsTable,
  eventApplicants,
} from "@/db/schema";
import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { runEval, reEvaluate, type ScoringModel } from "@/lib/eval-pipeline";
import { applyRowEnrichment } from "@/lib/row-enrichment";
import { resolveLinkedinUrl } from "@/lib/find-linkedin-handle";
import { isScoringModel } from "@/lib/admin";
import { reconcileHold } from "@/lib/admin-credit-enforcement";
import { refundCredits } from "@/lib/credits";
import { evaluateCriteria, type Criteria, type Stage } from "@/lib/criteria";
import { transitionApplicant } from "@/lib/events";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { linkAttendeesByLinkedin } from "@/lib/attendee-scoring";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// How many items we attempt per tick. Keep low so we stay within Exa /
// Claude burst limits and the worker's maxDuration.
const ITEMS_PER_TICK = 5;

// How long an item may sit in 'scoring' before we treat its worker as dead and
// reap it. MUST exceed maxDuration (300s) so we never reap an item that a
// still-alive overlapping tick is actively processing. When a tick is killed
// mid-item (300s timeout, deploy, OOM) the item stays flipped to 'scoring' but
// its try/catch never runs — and the claim query only picks up pending/resolved,
// so it's orphaned forever. That keeps the parent job 'running' indefinitely and
// the admin "SCORING…" chip lit even though everyone else finished (PRD: Jon
// Staenberg + Kevin Liu stuck on event 6e515b68).
const STUCK_SCORING_TIMEOUT_MIN = 15;

// Reap items stranded in 'scoring'/'resolving' by a dead worker: mark them failed
// (terminal) so the parent job can finalize and the chip stops phantom-showing
// "SCORING…". We deliberately fail rather than auto-requeue — an item that
// reliably blows the time budget would otherwise loop forever and burn spend.
// Admins re-run via the job's "Retry failed" action. Returns affected job ids so
// the caller can re-finalize them. (startedAt is NULL for never-claimed items, so
// `lt(startedAt, …)` only ever matches genuinely-claimed-then-stranded rows.)
export async function reapStuckScoringItems(): Promise<string[]> {
  const reaped = await db
    .update(scoringJobItems)
    .set({
      status: "failed",
      error: `scoring worker timed out — reaped after ${STUCK_SCORING_TIMEOUT_MIN}m stuck in 'scoring'`,
      completedAt: sql`NOW()`,
    })
    .where(
      and(
        inArray(scoringJobItems.status, ["scoring", "resolving"]),
        lt(scoringJobItems.startedAt, sql`NOW() - make_interval(mins => ${STUCK_SCORING_TIMEOUT_MIN})`),
        // Only reap items under a still-active job, mirroring the claim query
        // below. A terminal-but-not-'completed' job (e.g. a future 'cancelled')
        // must NOT be dragged to 'completed' by finalizeCompletedJob — whose
        // guard only excludes 'completed' — or its credit hold could be
        // reconciled/refunded twice. Latent today (nothing writes 'cancelled'),
        // defensive against it.
        inArray(
          scoringJobItems.jobId,
          db.select({ id: scoringJobs.id }).from(scoringJobs).where(inArray(scoringJobs.status, ["queued", "running"])),
        ),
      ),
    )
    .returning({ id: scoringJobItems.id, jobId: scoringJobItems.jobId });
  if (reaped.length === 0) return [];
  const byJob = new Map<string, number>();
  for (const r of reaped) byJob.set(r.jobId, (byJob.get(r.jobId) ?? 0) + 1);
  for (const [jobId, n] of byJob) {
    await db
      .update(scoringJobs)
      .set({ failedItems: sql`${scoringJobs.failedItems} + ${n}` })
      .where(eq(scoringJobs.id, jobId));
  }
  return [...byJob.keys()];
}

/**
 * Evaluate the auto-approval rule for a single event_applicant.
 * Idempotent: only acts on applicants in 'scored' status.
 * Auto mode → approved or denied terminal state.
 * Hybrid mode → approved on confident match, denied on far-miss, scored on near-miss.
 * Manual mode → no-op.
 */
export async function processEventApplicantAutoRule(applicantId: string) {
  const [a] = await db
    .select()
    .from(eventApplicants)
    .where(eq(eventApplicants.id, applicantId))
    .limit(1);
  if (!a || a.status !== "scored" || !a.evaluationId) return;

  const [e] = await db.select().from(eventsTable).where(eq(eventsTable.id, a.eventId)).limit(1);
  if (!e || e.approvalMode === "manual") return;

  const [ev] = await db.select().from(evaluations).where(eq(evaluations.id, a.evaluationId)).limit(1);
  if (!ev) return;

  const criteria = e.criteria as Criteria;
  const result = evaluateCriteria(criteria, {
    founderScore: ev.founderScore,
    investorScore: ev.investorScore,
    companyStage: (ev.companyStage as Stage | null) ?? null,
    investorStageFocus: ((ev as unknown as { investorStageFocus?: Stage[] }).investorStageFocus ?? []),
    bypassCodeMatched: !!a.bypassCodeId,
  });

  if (result.decision === "approved") {
    await transitionApplicant({
      applicantId,
      toStatus: "approved",
      reason: result.reason,
      actorEmail: "system:auto",
    });
    return;
  }
  if (result.decision === "denied" && e.approvalMode === "auto") {
    await transitionApplicant({
      applicantId,
      toStatus: "denied",
      reason: result.reason,
      actorEmail: "system:auto",
    });
    return;
  }
  // hybrid + denied OR review → leave in 'scored' for admin review.
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Reap items stranded in 'scoring' by a dead worker BEFORE claiming, so a job
  // whose only remaining items are zombies can finalize this tick (and its
  // "SCORING…" chip clears) even if nothing new is claimable.
  const reapedJobIds = await reapStuckScoringItems();

  // Pass: pending applicants whose URL already has an eval.
  // Covers the race where the apply route created an applicant in `pending`
  // while an eval for that LinkedIn URL already existed (or landed before
  // the per-item hook below could flip it). Runs every tick regardless of
  // whether any scoring items are claimable.
  const orphanPending = await db
    .select({ a: eventApplicants, ev: evaluations })
    .from(eventApplicants)
    .innerJoin(evaluations, eq(evaluations.linkedinUrl, eventApplicants.linkedinUrl))
    .where(eq(eventApplicants.status, "pending"))
    .limit(20);
  for (const row of orphanPending) {
    await db
      .update(eventApplicants)
      .set({ evaluationId: row.ev.id, status: "scored", updatedAt: new Date() })
      .where(eq(eventApplicants.id, row.a.id));
    await processEventApplicantAutoRule(row.a.id);
  }

  // Atomically claim up to N items: flip pending/resolved → 'scoring' in ONE
  // statement with FOR UPDATE SKIP LOCKED, so overlapping cron ticks (prod fires
  // this every minute, but a tick runs ~200s) claim DISJOINT items. The old
  // select-then-flip claim let two ticks grab the SAME item → duplicate-key
  // "failures" + ~2x spend (PRD: job a6c4cb1d "111 YC founders").
  const claimRes = await db.execute(sql`
    UPDATE scoring_job_items
    SET status = 'scoring', started_at = NOW()
    WHERE id IN (
      SELECT si.id
      FROM scoring_job_items si
      JOIN scoring_jobs sj ON sj.id = si.job_id
      WHERE si.status IN ('pending', 'resolved')
        AND sj.status IN ('queued', 'running')
      ORDER BY si.created_at ASC
      LIMIT ${ITEMS_PER_TICK}
      FOR UPDATE OF si SKIP LOCKED
    )
    RETURNING id
  `);
  const claimedRaw = (claimRes as unknown as { rows?: Array<{ id: string }> }).rows
    ?? (claimRes as unknown as Array<{ id: string }>);
  const claimedIds = (Array.isArray(claimedRaw) ? claimedRaw : []).map((r) => r.id);
  if (claimedIds.length === 0) {
    // Nothing to score, but a reap may have left jobs ready to finalize.
    for (const jobId of reapedJobIds) await finalizeCompletedJob(jobId);
    return NextResponse.json({ claimed: 0, processed: 0, reaped: reapedJobIds.length });
  }

  // Re-read the just-claimed rows (now 'scoring') with their job model.
  const claimable = await db
    .select({
      itemId: scoringJobItems.id,
      jobId: scoringJobItems.jobId,
      inputName: scoringJobItems.inputName,
      inputCompany: scoringJobItems.inputCompany,
      inputEmail: scoringJobItems.inputEmail,
      inputPhone: scoringJobItems.inputPhone,
      inputJobTitle: scoringJobItems.inputJobTitle,
      inputCity: scoringJobItems.inputCity,
      inputRegion: scoringJobItems.inputRegion,
      inputCountry: scoringJobItems.inputCountry,
      inputLocationRaw: scoringJobItems.inputLocationRaw,
      linkedinUrl: scoringJobItems.linkedinUrl,
      evaluationId: scoringJobItems.evaluationId,
      jobModel: scoringJobs.model,
    })
    .from(scoringJobItems)
    .innerJoin(scoringJobs, eq(scoringJobs.id, scoringJobItems.jobId))
    .where(inArray(scoringJobItems.id, claimedIds));

  // Flip parent jobs from queued → running and set startedAt where needed.
  const jobIds = [...new Set(claimable.map((c) => c.jobId))];
  for (const jobId of jobIds) {
    await db
      .update(scoringJobs)
      .set({ status: "running", startedAt: sql`COALESCE(${scoringJobs.startedAt}, NOW())` })
      .where(and(eq(scoringJobs.id, jobId), eq(scoringJobs.status, "queued")));
  }

  let processed = 0;
  for (const c of claimable) {
    if (!isScoringModel(c.jobModel)) {
      await failItem(c.itemId, c.jobId, `unknown model "${c.jobModel}"`, 0);
      continue;
    }
    const model = c.jobModel as ScoringModel;
    try {
      // (status already flipped to 'scoring' atomically during the claim above)
      let { linkedinUrl } = c;
      let costCents = 0;
      if (!linkedinUrl) {
        // Need to resolve from name/company first.
        if (!c.inputName) {
          throw new Error("missing inputName for unresolved item");
        }
        const resolved = await resolveLinkedinUrl(
          c.inputName,
          c.inputCompany ?? undefined,
          c.inputEmail ?? undefined,
        );
        linkedinUrl = resolved.url;
        // Real Exa cost of the resolution search. This search is not attached to
        // any eval row (it precedes the eval), so it is billed at the job level
        // here rather than via evaluations.pricing.
        costCents += Math.round(resolved.exaUsage.costUsd * 100);
        if (!linkedinUrl) {
          await skipItem(c.itemId, c.jobId, "no LinkedIn match found", costCents);
          processed++;
          continue;
        }
        await db
          .update(scoringJobItems)
          .set({ linkedinUrl })
          .where(eq(scoringJobItems.id, c.itemId));
      }

      // On a re-run the item keeps its evaluationId → force a fresh re-score in
      // place (reEvaluate), since runEval would just return the URL cache.
      // Fresh items have no eval yet → runEval creates one.
      const result = c.evaluationId
        ? await reEvaluate(c.evaluationId, { model })
        : await runEval(linkedinUrl, "url", { model });
      // Use the REAL per-eval cost (Claude + Exa) that the pipeline just
      // persisted on the evaluations row, instead of a flat per-model constant.
      const [evalRow] = await db
        .select({ cents: evaluations.costTotalCents })
        .from(evaluations)
        .where(eq(evaluations.id, result.evaluationId))
        .limit(1);
      costCents += evalRow?.cents ?? 0;

      await db
        .update(scoringJobItems)
        .set({
          status: "done",
          evaluationId: result.evaluationId,
          completedAt: sql`NOW()`,
          // Snapshot this run's score + cost so the row stays truthful even
          // after a later re-run overwrites the underlying evaluation.
          founderScore: result.founderScore,
          investorScore: result.investorScore,
          combinedScore: result.combinedScore,
          costCents: evalRow?.cents ?? null,
        })
        .where(eq(scoringJobItems.id, c.itemId));

      // Apply any email/location enrichment the input row carried (no-op when the
      // row supplied none). For bulk items there's no acting admin → null.
      await applyRowEnrichment(
        result.evaluationId,
        {
          email: c.inputEmail,
          phone: c.inputPhone,
          jobTitle: c.inputJobTitle,
          city: c.inputCity,
          region: c.inputRegion,
          country: c.inputCountry,
          locationRaw: c.inputLocationRaw,
        },
        null,
      );

      await db
        .update(scoringJobs)
        .set({
          completedItems: sql`${scoringJobs.completedItems} + 1`,
          actualCents: sql`${scoringJobs.actualCents} + ${costCents}`,
        })
        .where(eq(scoringJobs.id, c.jobId));

      // If this LinkedIn URL also has event_applicants in 'pending', flip them
      // to 'scored' (link the eval) and run the auto-rule.
      const newPending = await db
        .select()
        .from(eventApplicants)
        .where(
          and(
            eq(eventApplicants.linkedinUrl, linkedinUrl),
            eq(eventApplicants.status, "pending"),
          ),
        );
      for (const ap of newPending) {
        await db
          .update(eventApplicants)
          .set({ evaluationId: result.evaluationId, status: "scored", updatedAt: new Date() })
          .where(eq(eventApplicants.id, ap.id));
        await processEventApplicantAutoRule(ap.id);
      }

      // Link this freshly-scored URL to any event_attendees that captured it
      // from Luma but weren't matched yet (mirrors the applicant link-back above).
      // Attendees have no status to flip — only evaluationId is set.
      await linkAttendeesByLinkedin(linkedinUrl, result.evaluationId);

      processed++;
    } catch (err) {
      // Drizzle/Postgres errors stash the underlying cause on err.cause —
      // err.message just renders the query+params with no reason. Pull the
      // cause's message too so the admin UI shows "null value in column X"
      // instead of just the SQL.
      let msg = err instanceof Error ? err.message : String(err);
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof Error && cause.message && !msg.includes(cause.message)) {
        msg = `${cause.message} | ${msg}`;
      } else if (cause && typeof cause === "object") {
        const c = cause as { code?: string; message?: string; detail?: string };
        const causeStr = [c.code, c.message, c.detail].filter(Boolean).join(" — ");
        if (causeStr) msg = `${causeStr} | ${msg}`;
      }
      await failItem(c.itemId, c.jobId, msg, 0);
      processed++;
    }
  }

  // Mark jobs complete when all their items are terminal — including any job we
  // only touched via the reaper this tick.
  for (const jobId of new Set([...jobIds, ...reapedJobIds])) {
    await finalizeCompletedJob(jobId);
  }

  return NextResponse.json({ claimed: claimable.length, processed, reaped: reapedJobIds.length });
}

// Finalize one job: if every item is terminal, atomically transition it to
// 'completed' and reconcile its credit hold — refunding the over-reserved
// difference EXACTLY ONCE.
//
// SECURITY/CORRECTNESS (P0-4): scoring-tick runs every minute but a run can take
// ~200s, so consecutive ticks overlap. The old code read job.status, then did an
// UNCONDITIONAL `UPDATE ... SET status='completed'`, then refunded based on the
// STALE read — so two overlapping ticks both saw 'running' and both refunded the
// same hold, minting credits. The fix makes the status transition itself the
// idempotency gate: a single `UPDATE ... WHERE status <> 'completed' RETURNING`.
// Postgres re-checks the WHERE under the row lock, so only ONE tick's update
// matches a row; only that winner refunds. We deliberately do NOT zero the hold
// in that same UPDATE — RETURNING yields post-update values, and we need the
// original hold to compute the refund — so the winner zeroes it in a follow-up
// that, by construction, no loser ever reaches.
export async function finalizeCompletedJob(
  jobId: string,
): Promise<{ transitioned: boolean; refundedCents: number }> {
  const [tally] = await db
    .select({
      pending: sql<number>`COUNT(*) FILTER (WHERE ${scoringJobItems.status} IN ('pending','resolved','resolving','scoring'))`,
      done: sql<number>`COUNT(*) FILTER (WHERE ${scoringJobItems.status} IN ('done','enriched'))`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${scoringJobItems.status} IN ('failed','skipped'))`,
    })
    .from(scoringJobItems)
    .where(eq(scoringJobItems.jobId, jobId));
  if (Number(tally.pending) !== 0) return { transitioned: false, refundedCents: 0 };

  // Atomically claim the running -> completed transition. RETURNING carries the
  // (still-original) credit hold so the winner can reconcile it. A losing
  // overlapping tick matches 0 rows here and returns [].
  const [won] = await db
    .update(scoringJobs)
    .set({
      status: "completed",
      completedAt: sql`NOW()`,
      // Truthful counters from actual item states — belt-and-suspenders with
      // the atomic claim so totals can't show double-incremented values.
      completedItems: Number(tally.done),
      failedItems: Number(tally.failed),
    })
    .where(and(eq(scoringJobs.id, jobId), ne(scoringJobs.status, "completed")))
    .returning({
      estimatedCents: scoringJobs.estimatedCents,
      actualCents: scoringJobs.actualCents,
      creditHoldCents: scoringJobs.creditHoldCents,
      createdByClerkUserId: scoringJobs.createdByClerkUserId,
    });
  if (!won) return { transitioned: false, refundedCents: 0 };

  // Phase 3: reconcile the credit hold down to real cost and refund the
  // difference. Only the winning tick reaches here, so this runs exactly once.
  // (No-op unless enforcement reserved a hold at creation.)
  let refundedCents = 0;
  if ((won.creditHoldCents ?? 0) > 0 && won.createdByClerkUserId) {
    const { refundCents } = reconcileHold({
      holdCents: won.creditHoldCents!,
      estimatedCents: won.estimatedCents ?? 0,
      actualCents: won.actualCents,
    });
    if (refundCents > 0) {
      await refundCredits(won.createdByClerkUserId, refundCents, null);
      refundedCents = refundCents;
    }
    await db.update(scoringJobs).set({ creditHoldCents: 0 }).where(eq(scoringJobs.id, jobId));
  }
  return { transitioned: true, refundedCents };
}

async function failItem(itemId: string, jobId: string, error: string, costCents: number) {
  await db
    .update(scoringJobItems)
    .set({ status: "failed", error, completedAt: sql`NOW()` })
    .where(eq(scoringJobItems.id, itemId));
  await db
    .update(scoringJobs)
    .set({
      failedItems: sql`${scoringJobs.failedItems} + 1`,
      actualCents: sql`${scoringJobs.actualCents} + ${costCents}`,
    })
    .where(eq(scoringJobs.id, jobId));
}

async function skipItem(itemId: string, jobId: string, error: string, costCents: number) {
  await db
    .update(scoringJobItems)
    .set({ status: "skipped", error, completedAt: sql`NOW()` })
    .where(eq(scoringJobItems.id, itemId));
  await db
    .update(scoringJobs)
    .set({
      failedItems: sql`${scoringJobs.failedItems} + 1`,
      actualCents: sql`${scoringJobs.actualCents} + ${costCents}`,
    })
    .where(eq(scoringJobs.id, jobId));
}
