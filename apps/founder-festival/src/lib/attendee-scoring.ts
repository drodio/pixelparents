import { db } from "@/db";
import { scoringJobs, scoringJobItems, eventAttendees } from "@/db/schema";
import { estimateJobCents, isScoringModel } from "@/lib/admin";
import { holdCreditsForJob } from "@/lib/job-credit-hold";
import { and, eq, isNull } from "drizzle-orm";

export type EnqueueResult =
  | { kind: "ok"; jobId: string; count: number; estimatedCents: number }
  | { kind: "empty" }
  | { kind: "insufficient"; balanceCents: number; neededCents: number };

// Enqueue a scoring job that scores brand-new LinkedIn URLs (one item per URL,
// status "resolved" so the cron skips name-resolution and runs runEval(url)
// directly). Holds credits for the syncing user (super-admins are exempt inside
// holdCreditsForJob). The cron links each new eval back to event_attendees by
// linkedin_url (see scoring-tick). Caller is responsible for auth.
export async function enqueueAttendeeScoring(
  linkedinUrls: string[],
  opts: {
    clerkUserId: string | null;
    createdByEmail: string | null;
    model?: string;
    title?: string;
  },
): Promise<EnqueueResult> {
  const model = (opts.model ?? "sonnet").toLowerCase();
  const urls = [...new Set(linkedinUrls.filter((u) => !!u && u.trim()))];
  if (urls.length === 0) return { kind: "empty" };
  if (!isScoringModel(model)) return { kind: "empty" };

  const estimate = await estimateJobCents(urls.length, model);
  const hold = await holdCreditsForJob(opts.clerkUserId, estimate);
  if (hold.kind === "insufficient") {
    return {
      kind: "insufficient",
      balanceCents: hold.balanceCents,
      neededCents: hold.neededCents,
    };
  }

  const [job] = await db
    .insert(scoringJobs)
    .values({
      title: opts.title ?? "Auto-score event registrants",
      model,
      status: "queued",
      totalItems: urls.length,
      estimatedCents: estimate,
      createdByEmail: opts.createdByEmail,
      createdByClerkUserId: opts.clerkUserId,
      creditHoldCents: hold.creditHoldCents,
    })
    .returning();

  // Fresh-URL items: status "resolved" + linkedinUrl set + evaluationId null →
  // the cron calls runEval(url) and creates the evaluation.
  const rows = urls.map((u) => ({
    jobId: job!.id,
    inputRaw: u,
    linkedinUrl: u,
    status: "resolved" as const,
  }));
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(scoringJobItems).values(rows.slice(i, i + CHUNK));
  }

  return {
    kind: "ok",
    jobId: job!.id,
    count: urls.length,
    estimatedCents: job!.estimatedCents ?? estimate,
  };
}

// Link a freshly-scored LinkedIn URL back to any event_attendees that captured
// it from Luma but weren't matched yet (evaluationId is null). Called from the
// scoring-tick cron after runEval succeeds, mirroring the applicant link-back.
// Attendees have no status to flip — we only set evaluationId.
export async function linkAttendeesByLinkedin(
  linkedinUrl: string,
  evaluationId: string,
): Promise<void> {
  await db
    .update(eventAttendees)
    .set({ evaluationId, updatedAt: new Date() })
    .where(and(eq(eventAttendees.linkedinUrl, linkedinUrl), isNull(eventAttendees.evaluationId)));
}
