import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, eventApplicants, evaluations, bypassCodes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { canonicalizeLinkedinUrl, isUuid } from "@/lib/canonicalize";
import { processEventApplicantAutoRule } from "@/app/api/cron/scoring-tick/route";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";
import { isValidApplicantEmail } from "@/lib/email";

export const runtime = "nodejs";

// Read at request time (not module load) so the limit is overridable in tests.
function applyPerIpLimit(): number {
  return Number(process.env.EVENT_APPLY_PER_DAY_LIMIT) || 20;
}
function applyGlobalLimit(): number {
  return Number(process.env.EVENT_APPLY_GLOBAL_PER_DAY) || 500;
}

type Body = {
  evaluationId: string;
  email: string;
  fullName?: string;
  needs?: {
    stage?: string;
    helpAreas?: string[];
  };
  inviteCode?: string;
};

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.evaluationId || !isUuid(body.evaluationId) || !body?.email) {
    return NextResponse.json({ error: "evaluationId + email required" }, { status: 400 });
  }
  // SECURITY (P0-2): the stored email is mailed by downstream auto-approval, so
  // reject malformed / injection-bearing addresses before persisting.
  if (!isValidApplicantEmail(body.email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  // SECURITY (P0-2): this endpoint is unauthenticated and triggers stored rows +
  // (in auto/hybrid events) branded email. Rate-limit per IP and globally so it
  // can't be used as an open relay or to flood event_applicants. The global
  // circuit-breaker bounds total damage even under IP rotation.
  const ip = getRequestIp(req.headers);
  if (!(await checkAndIncrementRateLimit(`event-apply:${ip}`, applyPerIpLimit()))) {
    return NextResponse.json(
      { error: "rate limit", resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  if (!(await withinGlobalDailyLimit("event-apply", applyGlobalLimit()))) {
    return NextResponse.json(
      { error: "temporarily unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!event || event.status === "draft") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (event.status === "closed" || event.status === "past") {
    return NextResponse.json({ error: "event closed" }, { status: 410 });
  }

  const [ev] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.id, body.evaluationId))
    .limit(1);
  if (!ev) return NextResponse.json({ error: "invalid evaluationId" }, { status: 400 });

  // Belt-and-suspenders: evaluations.linkedin_url is always written canonical
  // upstream, but re-canonicalize so we can't mis-key the dedupe lookup.
  const linkedinUrl = canonicalizeLinkedinUrl(ev.linkedinUrl) ?? ev.linkedinUrl;

  const [existing] = await db
    .select()
    .from(eventApplicants)
    .where(and(eq(eventApplicants.eventId, event.id), eq(eventApplicants.linkedinUrl, linkedinUrl)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ ok: true, applicantId: existing.id, duplicate: true });
  }

  // Optional invite code: case-insensitive lookup against bypass_codes,
  // scoped to this event (or global). Doesn't fail the submit if the code
  // is bogus — we just don't attach it.
  let bypassCodeId: string | null = null;
  if (body.inviteCode) {
    const [code] = await db
      .select()
      .from(bypassCodes)
      .where(sql`lower(${bypassCodes.code}) = lower(${body.inviteCode})`)
      .limit(1);
    if (code && (code.eventId == null || code.eventId === event.id)) {
      bypassCodeId = code.id;
    }
  }

  const [newApplicant] = await db
    .insert(eventApplicants)
    .values({
      eventId: event.id,
      evaluationId: ev.id,
      linkedinUrl,
      fullName: body.fullName ?? ev.fullName ?? null,
      email: body.email,
      needs: body.needs ?? null,
      bypassCodeId,
      status: "scored",
    })
    .returning();

  await processEventApplicantAutoRule(newApplicant.id);

  return NextResponse.json({ ok: true, applicantId: newApplicant.id, duplicate: false });
}
