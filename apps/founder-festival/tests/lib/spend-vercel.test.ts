import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fresh module per test → fresh in-memory cache, so caching behavior is
// deterministic. Each test stubs global fetch and sets the env it needs.
async function load() {
  vi.resetModules();
  return import("@/lib/spend/vercel-ai-gateway");
}

const ORIGINAL_KEY = process.env.AI_GATEWAY_API_KEY;

beforeEach(() => {
  process.env.AI_GATEWAY_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ORIGINAL_KEY;
});

describe("getVercelCredits", () => {
  it("returns parsed totals on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ balance: "4.18", total_used: "0.82" }), { status: 200 })),
    );
    const { getVercelCredits } = await load();
    const res = await getVercelCredits();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.totalUsedUsd).toBeCloseTo(0.82, 6);
      expect(res.data.balanceUsd).toBeCloseTo(4.18, 6);
      expect(typeof res.data.fetchedAt).toBe("string");
    }
  });

  it("errors (without throwing) when the key is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getVercelCredits } = await load();
    const res = await getVercelCredits();
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors on a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const { getVercelCredits } = await load();
    const res = await getVercelCredits();
    expect(res.ok).toBe(false);
  });

  it("errors when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const { getVercelCredits } = await load();
    const res = await getVercelCredits();
    expect(res.ok).toBe(false);
  });

  it("caches within the TTL (second call does not refetch)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ balance: "1", total_used: "2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getVercelCredits } = await load();
    await getVercelCredits();
    await getVercelCredits();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
