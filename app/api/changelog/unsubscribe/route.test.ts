import { describe, expect, it, vi } from "vitest";
import { resolveUnsubscribe } from "./route";

describe("resolveUnsubscribe", () => {
  it("reports 'unsubscribed' only when a subscriber row was actually changed", async () => {
    const run = vi.fn().mockResolvedValue(1);
    const outcome = await resolveUnsubscribe(
      { token: "tok-123", email: "", hasDb: true },
      run,
    );
    expect(outcome).toBe("unsubscribed");
    expect(run).toHaveBeenCalledWith({ token: "tok-123" });
  });

  it("reports 'not-found' when the update changed zero rows (stale/invalid link)", async () => {
    const run = vi.fn().mockResolvedValue(0);
    const outcome = await resolveUnsubscribe(
      { token: "stale", email: "", hasDb: true },
      run,
    );
    expect(outcome).toBe("not-found");
  });

  it("prefers the token over the email when both are present", async () => {
    const run = vi.fn().mockResolvedValue(1);
    await resolveUnsubscribe(
      { token: "tok", email: "a@example.com", hasDb: true },
      run,
    );
    expect(run).toHaveBeenCalledWith({ token: "tok" });
  });

  it("falls back to email when no token is given", async () => {
    const run = vi.fn().mockResolvedValue(1);
    const outcome = await resolveUnsubscribe(
      { token: "", email: "a@example.com", hasDb: true },
      run,
    );
    expect(outcome).toBe("unsubscribed");
    expect(run).toHaveBeenCalledWith({ email: "a@example.com" });
  });

  it("reports 'error' (never runs the update) when the database is unavailable", async () => {
    const run = vi.fn();
    const outcome = await resolveUnsubscribe(
      { token: "tok", email: "", hasDb: false },
      run,
    );
    expect(outcome).toBe("error");
    expect(run).not.toHaveBeenCalled();
  });

  it("reports 'error' when neither a token nor a valid email is provided", async () => {
    const run = vi.fn();
    const outcome = await resolveUnsubscribe(
      { token: "", email: "not-an-email", hasDb: true },
      run,
    );
    expect(outcome).toBe("error");
    expect(run).not.toHaveBeenCalled();
  });

  it("reports 'error' (and swallows) when the update throws", async () => {
    const run = vi.fn().mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await resolveUnsubscribe(
      { token: "tok", email: "", hasDb: true },
      run,
    );
    expect(outcome).toBe("error");
    spy.mockRestore();
  });
});
