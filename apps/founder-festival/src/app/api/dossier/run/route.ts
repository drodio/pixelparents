import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { isUuid } from "@/lib/canonicalize";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";
import { getBalanceCents, reserveCredits, refundCredits, linkDebitEvaluation } from "@/lib/credits";
import { DOSSIER_COST_CENTS } from "@/lib/credit-packs";
import { chiefConfigured, chiefSubmit } from "@/lib/chief";
import { buildDossierPrompt } from "@/lib/dossier-prompt";
import { getProfileDossier, startDossier } from "@/lib/profile-dossier";
import { isSuperAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Kick off a Chief "Deep Intelligence" dossier for a profile and charge the
// signed-in buyer $50. chiefSubmit is a fast POST (returns ids immediately); the
// long research runs in the background and the chief-dossier-sweep cron polls it
// to completion. We reserve credits up front and refund if submission fails.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!chiefConfigured()) {
    return NextResponse.json({ error: "dossiers_unavailable" }, { status: 503 });
  }

  let body: { evaluationId?: string; admin?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const evaluationId = body.evaluationId;
  if (!evaluationId || !isUuid(evaluationId)) {
    return NextResponse.json({ error: "invalid evaluationId" }, { status: 400 });
  }

  // Super admins can run a dossier WITHOUT spending credits. Verified server-side
  // — the client `admin` flag alone never grants a free run.
  const adminRun = body.admin === true && (await isSuperAdmin());

  // Load the subject. Code-sourced rows don't get dossiers.
  const [ev] = await db
    .select({
      source: evaluations.source,
      fullName: evaluations.fullName,
      jobTitle: evaluations.jobTitle,
      credibilityTitle: evaluations.credibilityTitle,
      subjectCity: evaluations.subjectCity,
      subjectRegion: evaluations.subjectRegion,
      subjectCountry: evaluations.subjectCountry,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!ev || ev.source === "code") {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  // The highest-confidence claim provides the displayed nickname + self-set
  // location (mirrors the profile page; "high" only to avoid impersonation).
  const [claim] = await db
    .select({
      nickname: users.nickname,
      city: users.city,
      region: users.region,
      country: users.country,
    })
    .from(users)
    .where(and(eq(users.evaluationId, evaluationId), eq(users.matchConfidence, "high")))
    .orderBy(desc(users.verifiedAt))
    .limit(1);

  const name = claim?.nickname?.trim() || ev.fullName?.trim() || "";
  if (!name) {
    return NextResponse.json({ error: "profile has no name to research" }, { status: 422 });
  }

  // Block only an in-flight run (avoids double-charging on a double click). A
  // "ready" or "failed" dossier CAN be re-run — startDossier overwrites the row,
  // and re-running is an explicit, paid action (free for super admins).
  const existing = await getProfileDossier(evaluationId);
  if (existing && existing.status === "running") {
    return NextResponse.json({ error: "dossier_running", status: existing.status }, { status: 409 });
  }

  // Charge the buyer $50 up front (race-proof) — skipped for a super-admin run.
  let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
  if (!adminRun) {
    reservation = await reserveCredits(userId, DOSSIER_COST_CENTS);
    if (!reservation) {
      const balance = await getBalanceCents(userId);
      return NextResponse.json(
        {
          error: "payment_required",
          price_cents: DOSSIER_COST_CENTS,
          balance_cents: balance,
          topup_url: `${new URL(req.url).origin}/developers`,
        },
        { status: 402 },
      );
    }
  }

  // Build the prompt with the Founder Festival profile as the identity anchor.
  const origin = new URL(req.url).origin;
  const path = await canonicalProfileUrl(evaluationId);
  const ffUrl = `${origin}${path ?? `/profile?e=${evaluationId}`}`;
  const location =
    [
      claim?.city ?? ev.subjectCity,
      claim?.region ?? ev.subjectRegion,
      claim?.country ?? ev.subjectCountry,
    ]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(", ") || null;
  const prompt = buildDossierPrompt({
    nickname: claim?.nickname ?? null,
    fullName: ev.fullName ?? null,
    ffUrl,
    // Prefer the curated credibility_title (richer/more reliable) over the raw
    // pipeline-extracted job_title, which can be stale/wrong (e.g. "CEO" when the
    // person is Co-Founder & CCO) and made Chief flag a title discrepancy.
    title: ev.credibilityTitle?.trim() || ev.jobTitle?.trim() || null,
    location,
  });

  // Submit to Chief (fast). On failure, refund and bail — nothing persisted.
  let handle: Awaited<ReturnType<typeof chiefSubmit>> = null;
  try {
    handle = await chiefSubmit(prompt, { intelligence: "research", publicData: true });
  } catch (err) {
    console.error("dossier chiefSubmit threw", err);
  }
  if (!handle) {
    if (reservation) await refundCredits(userId, DOSSIER_COST_CENTS, evaluationId);
    return NextResponse.json({ error: "submit_failed" }, { status: 503 });
  }

  // Persist the in-flight row. For a paid run, record the buyer (so the sweep can
  // refund on failure) and link the debit; a free admin run has no buyer/debit.
  await startDossier({
    evaluationId,
    buyerClerkUserId: adminRun ? null : userId,
    chatId: handle.chatId,
    messageId: handle.messageId,
    intelligence: "research",
  });
  if (reservation) await linkDebitEvaluation(reservation.ledgerId, evaluationId);

  return NextResponse.json({ ok: true, status: "running", admin: adminRun });
}
