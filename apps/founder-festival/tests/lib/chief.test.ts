import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chiefSearch, chiefConfigured, chiefCallsUsed, resetChiefCalls, ChiefBudgetError } from "@/lib/chief";

const ENV = { ...process.env };
beforeEach(() => {
  resetChiefCalls();
  process.env.CHIEF_API_TOKEN = "pat_test";
  process.env.CHIEF_PROJECT_ID = "project_test";
  delete process.env.CHIEF_CALL_BUDGET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = { ...ENV };
});

describe("chiefConfigured", () => {
  it("is false without token or project id", () => {
    delete process.env.CHIEF_API_TOKEN;
    expect(chiefConfigured()).toBe(false);
  });
  it("is true with both", () => {
    expect(chiefConfigured()).toBe(true);
  });
});

describe("chiefSearch", () => {
  it("no-ops (null) when not configured — never throws", async () => {
    delete process.env.CHIEF_PROJECT_ID;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await chiefSearch("hi")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("enforces the CALL budget (the only meterable budget) by throwing", async () => {
    process.env.CHIEF_CALL_BUDGET = "1";
    // First call: POST then a completed poll.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: any) => {
        if (init?.method === "POST") return { ok: true, json: async () => ({ chat_id: "chat_1", message_id: "msg_1" }) };
        return { ok: true, json: async () => ({ response: "done" }) };
      }),
    );
    const r = await chiefSearch("first", { pollMs: 1, maxWaitMs: 1000 });
    expect(r?.text).toBe("done");
    expect(chiefCallsUsed()).toBe(1);
    // Second call exceeds budget=1 → throws.
    await expect(chiefSearch("second")).rejects.toBeInstanceOf(ChiefBudgetError);
  });

  it("returns null on POST error (fail-safe)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await chiefSearch("x", { pollMs: 1, maxWaitMs: 50 })).toBeNull();
  });

  it("polls until response lands and reports elapsed + calls", async () => {
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: any) => {
        if (init?.method === "POST") return { ok: true, json: async () => ({ chat_id: "c", message_id: "m" }) };
        polls++;
        return polls < 2
          ? { ok: true, json: async () => ({ id: "m" }) } // still pending (no `response`)
          : { ok: true, json: async () => ({ response: "tweets here" }) };
      }),
    );
    const r = await chiefSearch("find X posts", { pollMs: 1, maxWaitMs: 1000 });
    expect(r?.text).toBe("tweets here");
    expect(r?.calls).toBe(1);
    expect(polls).toBeGreaterThanOrEqual(2);
  });
});
