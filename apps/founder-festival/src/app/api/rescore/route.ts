import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { reEvaluate } from "@/lib/eval-pipeline";
import { getRequestGeo } from "@/lib/request-ip";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { isEvalOwner } from "@/lib/authz";
import { isAdmin, isSuperAdmin } from "@/lib/admin";
import { reportServerError } from "@/lib/report-server-error";

// Heavy, high-presence profiles (e.g. Patrick Collison) that escalate to Opus
// can exceed 60s end-to-end; past the limit Vercel kills the function and the
// client fetch surfaces a bare "Network error". 180s gives headroom (Vercel
// allows up to 300, which the scoring-tick cron already uses). The latency of
// the enricher mesh is also reduced (parallelized HN identity resolution).
export const maxDuration = 180;

// Rescore is always a real Exa + Claude run, so every call costs money AND
// overwrites the evaluation row in place. It must therefore be gated to people
// who own the profile (claimed it via /claim/callback) or admins — otherwise
// anyone could re-roll a stranger's score or grief a competitor. Shares the
// global eval budget; also per-user rate-limited.
const PER_DAY_LIMIT = Number(process.env.EVAL_PER_DAY_LIMIT) || 25;
const GLOBAL_PER_DAY = Number(process.env.EVAL_GLOBAL_PER_DAY) || 800;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "sign in to re-score" }, { status: 401 });
  }

  let body: { evaluationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.evaluationId) {
    return NextResponse.json({ error: "evaluationId required" }, { status: 400 });
  }

  // Ownership gate: only the claimed owner of this eval, an admin, or a
  // super-admin may re-score it (super-admins drive the floating admin box on
  // any profile). Anonymous viewers and signed-in non-owners are rejected.
  const owner = await isEvalOwner(userId, body.evaluationId);
  if (!owner && !(await isAdmin()) && !(await isSuperAdmin())) {
    return NextResponse.json(
      { error: "claim this profile to re-score it" },
      { status: 403 },
    );
  }

  // Per-user limit (now that we have an authenticated identity, key on it
  // rather than a spoofable IP) plus the global circuit-breaker.
  if (!(await checkAndIncrementRateLimit(`rs:${userId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  if (!(await withinGlobalDailyLimit("eval", GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  try {
    // Record the requester's IP + approximate location (this re-score is a
    // paid run) so /admin/profiles reflects the latest individual requester.
    return NextResponse.json(
      await reEvaluate(body.evaluationId, { requester: getRequestGeo(req.headers) }),
    );
  } catch (err) {
    // Never surface raw error text (it can leak internals / DB shape).
    // reportServerError handles: console log, PostHog capture, admin email
    // (deduped 1/hour per fingerprint). Awaited so logs/email finish before
    // the function freezes on serverless return.
    await reportServerError(err, {
      route: "POST /api/rescore",
      evaluationId: body?.evaluationId,
    });
    return NextResponse.json({ error: "rescore failed" }, { status: 503 });
  }
}
