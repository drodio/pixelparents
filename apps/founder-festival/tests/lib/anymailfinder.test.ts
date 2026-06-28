import { describe, it, expect, vi, afterEach } from "vitest";
import { findPersonEmail } from "@/lib/anymailfinder";

function mockFetch(status: number, json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(json), { status })),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("findPersonEmail", () => {
  it("returns the valid email on a hit", async () => {
    mockFetch(200, { email: "a@b.com", email_status: "valid", valid_email: "a@b.com" });
    const r = await findPersonEmail({ apiKey: "k", linkedinUrl: "https://linkedin.com/in/x" });
    expect(r).toEqual({ email: "a@b.com", status: "valid" });
  });

  it("returns no email on not_found (free / no charge)", async () => {
    mockFetch(200, { email: null, email_status: "not_found", valid_email: null });
    const r = await findPersonEmail({ apiKey: "k", linkedinUrl: "https://linkedin.com/in/x" });
    expect(r).toEqual({ email: null, status: "not_found" });
  });

  it("does not surface a risky email (no charge, no store)", async () => {
    mockFetch(200, { email: "maybe@b.com", email_status: "risky", valid_email: null });
    const r = await findPersonEmail({ apiKey: "k", linkedinUrl: "https://linkedin.com/in/x" });
    expect(r).toEqual({ email: null, status: "risky" });
  });

  it("treats a 400 (bad input for this profile) as a miss, not a throw", async () => {
    mockFetch(400, { error: "not enough data" });
    const r = await findPersonEmail({ apiKey: "k", fullName: "No Company" });
    expect(r).toEqual({ email: null, status: "not_found" });
  });

  it("throws on 401 so a bad key surfaces loudly", async () => {
    mockFetch(401, { error: "unauthorized" });
    await expect(findPersonEmail({ apiKey: "bad", linkedinUrl: "https://linkedin.com/in/x" }))
      .rejects.toThrow(/unauthorized/);
  });

  it("sends linkedin_url, full_name, and domain when provided", async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ email_status: "not_found" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", spy);
    await findPersonEmail({ apiKey: "k", linkedinUrl: "https://linkedin.com/in/x", fullName: "Ada L", domain: "acme.com" });
    const init = spy.mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ linkedin_url: "https://linkedin.com/in/x", full_name: "Ada L", domain: "acme.com" });
  });
});
