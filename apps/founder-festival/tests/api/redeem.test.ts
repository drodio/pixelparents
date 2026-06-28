import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import { bypassCodes, evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/redeem/route";
import { IS_PROD_DB } from "../setup";

describe.skipIf(IS_PROD_DB)("POST /api/redeem", () => {
  const code = "TEST-CODE-X1";

  beforeAll(async () => {
    await db.delete(evaluations).where(eq(evaluations.sourceCode, code));
    await db.delete(bypassCodes).where(eq(bypassCodes.code, code));
    await db.insert(bypassCodes).values({ code, maxUses: 2, assignedScore: 50 });
  });

  afterAll(async () => {
    await db.delete(evaluations).where(eq(evaluations.sourceCode, code));
    await db.delete(bypassCodes).where(eq(bypassCodes.code, code));
  });

  it("redeems a valid code", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ code }) }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.assignedScore).toBe(50);
    expect(json.evaluationId).toBeDefined();
  });

  it("rejects invalid code", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ code: "NOPE-NOT-A-CODE" }) }));
    expect(res.status).toBe(400);
  });
});
