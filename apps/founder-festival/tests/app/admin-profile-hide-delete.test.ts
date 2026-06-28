import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { db } from "@/db";
import { events, eventApplicants, evaluations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";

let mockIsSuperAdmin = true;
let mockUserId: string | null = "u_admin_test";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
}));
vi.mock("@/lib/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin")>();
  return {
    ...actual,
    isSuperAdmin: vi.fn(async () => mockIsSuperAdmin),
  };
});

import { POST as hidePost } from "@/app/api/admin/profile/[evalId]/hide/route";
import { POST as deletePost } from "@/app/api/admin/profile/[evalId]/delete/route";

const cleanupEvalIds: string[] = [];
const cleanupClerkUserIds: string[] = [];
const cleanupEventIds: string[] = [];

async function seedEval(): Promise<string> {
  const url = `https://linkedin.com/in/hide-test-${crypto.randomUUID()}`;
  const [row] = await db
    .insert(evaluations)
    .values({
      linkedinUrl: url,
      score: 100,
      founderScore: 50,
      investorScore: 50,
      signalQuality: "good",
      source: "url",
    })
    .returning({ id: evaluations.id });
  cleanupEvalIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (cleanupEvalIds.length > 0) {
    await db.delete(evaluations).where(eq(evaluations.id, cleanupEvalIds[0]!));
    for (const id of cleanupEvalIds) {
      await db.delete(evaluations).where(eq(evaluations.id, id));
    }
  }
  for (const id of cleanupClerkUserIds) {
    await db.delete(users).where(eq(users.clerkUserId, id));
  }
  for (const id of cleanupEventIds) {
    await db.delete(eventApplicants).where(eq(eventApplicants.eventId, id));
    await db.delete(events).where(eq(events.id, id));
  }
});

beforeEach(() => {
  mockIsSuperAdmin = true;
  mockUserId = "u_admin_test";
});

function makeReq(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(IS_PROD_DB)("POST /api/admin/profile/[evalId]/hide", () => {
  it("returns 401 when not signed in", async () => {
    mockUserId = null;
    const evalId = await seedEval();
    const res = await hidePost(makeReq({ hidden: true }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-superadmin", async () => {
    mockIsSuperAdmin = false;
    const evalId = await seedEval();
    const res = await hidePost(makeReq({ hidden: true }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when hidden is missing or non-boolean", async () => {
    const evalId = await seedEval();
    const res = await hidePost(makeReq({}), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when eval doesn't exist", async () => {
    const fakeId = crypto.randomUUID();
    const res = await hidePost(makeReq({ hidden: true }), {
      params: Promise.resolve({ evalId: fakeId }),
    });
    expect(res.status).toBe(404);
  });

  it("sets hidden_at + hidden_by when hidden=true", async () => {
    const evalId = await seedEval();
    const res = await hidePost(makeReq({ hidden: true }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; hidden: boolean };
    expect(body).toEqual({ ok: true, hidden: true });

    const [row] = await db
      .select({ hiddenAt: evaluations.hiddenAt, hiddenBy: evaluations.hiddenByClerkUserId })
      .from(evaluations)
      .where(eq(evaluations.id, evalId));
    expect(row?.hiddenAt).not.toBeNull();
    expect(row?.hiddenBy).toBe("u_admin_test");
  });

  it("clears hidden_at when hidden=false", async () => {
    const evalId = await seedEval();
    await hidePost(makeReq({ hidden: true }), { params: Promise.resolve({ evalId }) });
    const res = await hidePost(makeReq({ hidden: false }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(200);
    const [row] = await db
      .select({ hiddenAt: evaluations.hiddenAt, hiddenBy: evaluations.hiddenByClerkUserId })
      .from(evaluations)
      .where(eq(evaluations.id, evalId));
    expect(row?.hiddenAt).toBeNull();
    expect(row?.hiddenBy).toBeNull();
  });
});

describe.skipIf(IS_PROD_DB)("POST /api/admin/profile/[evalId]/delete", () => {
  it("returns 401 when not signed in", async () => {
    mockUserId = null;
    const evalId = await seedEval();
    const res = await deletePost(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-superadmin", async () => {
    mockIsSuperAdmin = false;
    const evalId = await seedEval();
    const res = await deletePost(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when eval doesn't exist", async () => {
    const fakeId = crypto.randomUUID();
    const res = await deletePost(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ evalId: fakeId }),
    });
    expect(res.status).toBe(404);
  });

  it("deletes the eval row + any claim rows on it", async () => {
    const evalId = await seedEval();
    const clerkUserId = `u_claimer_${crypto.randomUUID()}`;
    cleanupClerkUserIds.push(clerkUserId);
    await db.insert(users).values({
      clerkUserId,
      evaluationId: evalId,
      verifiedAt: new Date(),
      matchConfidence: "high",
    });

    const res = await deletePost(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const evalRows = await db.select().from(evaluations).where(eq(evaluations.id, evalId));
    expect(evalRows.length).toBe(0);
    const claimRows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(claimRows.length).toBe(0);
  });

  it("deletes the eval even when an event_applicants row references it", async () => {
    // Regression for the 2026-05-28 prod incident: cascade missed the
    // event_applicants table, so any eval that had been linked to an event
    // application would 500 on delete with a 23503 FK violation.
    const evalId = await seedEval();
    const [evt] = await db
      .insert(events)
      .values({
        slug: `test-evt-${crypto.randomUUID()}`,
        title: "Test event",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
      })
      .returning({ id: events.id });
    cleanupEventIds.push(evt!.id);
    await db.insert(eventApplicants).values({
      eventId: evt!.id,
      evaluationId: evalId,
      linkedinUrl: `https://linkedin.com/in/applicant-${crypto.randomUUID()}`,
      email: `applicant-${crypto.randomUUID()}@example.com`,
    });

    const res = await deletePost(new Request("http://localhost/test", { method: "POST" }), {
      params: Promise.resolve({ evalId }),
    });
    expect(res.status).toBe(200);

    const evalRows = await db.select().from(evaluations).where(eq(evaluations.id, evalId));
    expect(evalRows.length).toBe(0);
    const appRows = await db
      .select()
      .from(eventApplicants)
      .where(eq(eventApplicants.evaluationId, evalId));
    expect(appRows.length).toBe(0);
  });
});
