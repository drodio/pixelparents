import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("passes the response through when fetch resolves in time", async () => {
    const fakeRes = new Response("ok");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(fakeRes);
    const res = await fetchWithTimeout("https://x.test", {}, 1000);
    expect(res).toBe(fakeRes);
    // The caller's request carried an AbortSignal.
    expect((spy.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts (rejects) when fetch outlasts the timeout", async () => {
    vi.useFakeTimers();
    // A fetch that only settles when its signal aborts.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const p = fetchWithTimeout("https://x.test", {}, 50);
    const assertion = expect(p).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
  });

  it("preserves caller-provided init (method/headers)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await fetchWithTimeout("https://x.test", { method: "POST", headers: { "x-a": "1" } }, 1000);
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "x-a": "1" });
  });
});
