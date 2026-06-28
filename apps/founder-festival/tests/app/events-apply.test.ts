import { describe, it, expect, vi } from "vitest";
import { db } from "@/db";
import { events, eventApplicants, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

// Stub the email module — the apply route calls
// processEventApplicantAutoRule which can trigger decision emails on
// auto-approval. Tests below use `manual` mode (no emails fire) plus one
// `auto` event, so the stub is belt-and-suspenders to keep the suite
// hermetic.
vi.mock("@/lib/email", async (importActual) => ({
  // Keep the real pure helpers (e.g. isValidApplicantEmail) — only the network
  // senders are stubbed so the suite stays hermetic.
  ...(await importActual<typeof import("@/lib/email")>()),
  sendEventDecisionEmail: vi.fn().mockResolvedValue(undefined),
  sendApplicationReceivedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/events/[slug]/apply/route";

async function makeOpenEvent(slug: string) {
  await db.insert(events).values({
    slug,
    title: "Apply Test",
    startsAt: new Date("2026-07-01"),
    status: "open",
    approvalMode: "manual",
    criteria: { side: "founder", founderScoreMin: 50, investorScoreMin: 0, stages: [] },
  });
}

async function seedEval(linkedinUrl: string) {
  const [ev] = await db.insert(evaluations).values({
    linkedinUrl,
    fullName: "T",
    score: 100,
    founderScore: 100,
    investorScore: 0,
    signalQuality: "high",
    source: "url",
  }).returning();
  return ev;
}

// Each request defaults to a FRESH trusted IP so the new per-IP rate limit
// (keyed on x-vercel-forwarded-for) doesn't accumulate across the suite / runs.
// Pass an explicit `ip` to exercise the limit deliberately.
function freshIp() {
  return "203.0.113." + Math.floor(Math.random() * 254 + 1);
}
function makeRequest(body: object, ip: string = freshIp()) {
  return new Request("http://localhost/api/events/x/apply", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe.skipIf(IS_PROD_DB)("POST /events/:slug/apply", () => {
  it("creates an applicant in scored status (sync scoring path)", async () => {
    const slug = "apply-test-" + Math.random().toString(36).slice(2, 6);
    await makeOpenEvent(slug);
    const ev = await seedEval(
      "https://linkedin.com/in/applicant-" + Math.random().toString(36).slice(2, 6),
    );
    const req = makeRequest({
      evaluationId: ev.id,
      email: "applicant@example.com",
      fullName: "Applicant A",
    });
    const res = await POST(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; applicantId: string };
    expect(body.ok).toBe(true);
    const [reread] = await db
      .select()
      .from(eventApplicants)
      .where(eq(eventApplicants.id, body.applicantId))
      .limit(1);
    expect(reread.email).toBe("applicant@example.com");
    // Manual-mode event → auto-rule no-ops → stays in 'scored'.
    expect(reread.status).toBe("scored");
  });

  it("rejects a malformed / injection-bearing email (400)", async () => {
    const slug = "bademail-" + Math.random().toString(36).slice(2, 6);
    await makeOpenEvent(slug);
    const ev = await seedEval(
      "https://linkedin.com/in/bademail-" + Math.random().toString(36).slice(2, 6),
    );
    const req = makeRequest({
      evaluationId: ev.id,
      email: "victim@target.com\nbcc: someone@else.com",
    });
    const res = await POST(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated applies from the same IP (429)", async () => {
    const prev = process.env.EVENT_APPLY_PER_DAY_LIMIT;
    process.env.EVENT_APPLY_PER_DAY_LIMIT = "1";
    try {
      const slug = "rl-" + Math.random().toString(36).slice(2, 6);
      await makeOpenEvent(slug);
      const ip = "198.51.100." + Math.floor(Math.random() * 254 + 1);
      const ev1 = await seedEval("https://linkedin.com/in/rl1-" + Math.random().toString(36).slice(2, 6));
      const ev2 = await seedEval("https://linkedin.com/in/rl2-" + Math.random().toString(36).slice(2, 6));

      const first = await POST(makeRequest({ evaluationId: ev1.id, email: "a@b.com" }, ip), {
        params: Promise.resolve({ slug }),
      });
      expect(first.status).toBe(200);
      const second = await POST(makeRequest({ evaluationId: ev2.id, email: "c@d.com" }, ip), {
        params: Promise.resolve({ slug }),
      });
      expect(second.status).toBe(429);
    } finally {
      if (prev === undefined) delete process.env.EVENT_APPLY_PER_DAY_LIMIT;
      else process.env.EVENT_APPLY_PER_DAY_LIMIT = prev;
    }
  });

  it("rejects when event is draft (404)", async () => {
    const slug = "draft-" + Math.random().toString(36).slice(2, 6);
    await db.insert(events).values({
      slug,
      title: "Draft",
      startsAt: new Date("2026-07-01"),
      status: "draft",
      approvalMode: "manual",
      criteria: {},
    });
    const ev = await seedEval(
      "https://linkedin.com/in/draft-" + Math.random().toString(36).slice(2, 6),
    );
    const req = makeRequest({ evaluationId: ev.id, email: "x@y.com" });
    const res = await POST(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing required fields", async () => {
    const slug = "validation-" + Math.random().toString(36).slice(2, 6);
    await makeOpenEvent(slug);
    const req = makeRequest({ email: "no-eval@example.com" });
    const res = await POST(req, { params: Promise.resolve({ slug }) });
    expect(res.status).toBe(400);
  });

  it("is idempotent for the same event+url (re-submit returns same applicant)", async () => {
    const slug = "dup-" + Math.random().toString(36).slice(2, 6);
    await makeOpenEvent(slug);
    const ev = await seedEval(
      "https://linkedin.com/in/dup-applicant-" + Math.random().toString(36).slice(2, 6),
    );
    const req1 = makeRequest({ evaluationId: ev.id, email: "a@b.com" });
    const res1 = await POST(req1, { params: Promise.resolve({ slug }) });
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { applicantId: string };

    const req2 = makeRequest({ evaluationId: ev.id, email: "a@b.com" });
    const res2 = await POST(req2, { params: Promise.resolve({ slug }) });
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { applicantId: string; duplicate: boolean };
    expect(body2.applicantId).toBe(body1.applicantId);
    expect(body2.duplicate).toBe(true);
  });
});
