import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { smsConfigured, sendAdminSms } from "@/lib/sms";

// The four env vars that must ALL be present for SMS to send.
const ENV_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "ADMIN_ALERT_PHONE",
] as const;

const saved: Record<string, string | undefined> = {};

function setFullConfig() {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_FROM_NUMBER = "+15005550006";
  process.env.ADMIN_ALERT_PHONE = "+14155551234";
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("smsConfigured", () => {
  it("is false when nothing is set", () => {
    expect(smsConfigured()).toBe(false);
  });

  it("is false when any one var is missing", () => {
    setFullConfig();
    delete process.env.ADMIN_ALERT_PHONE; // recipient missing
    expect(smsConfigured()).toBe(false);
  });

  it("is true only when all four vars are present", () => {
    setFullConfig();
    expect(smsConfigured()).toBe(true);
  });
});

describe("sendAdminSms", () => {
  it("no-ops (returns null, no fetch) when not configured", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const r = await sendAdminSms("anything");
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("POSTs to Twilio with Basic auth + To/From/Body and returns the sid", async () => {
    setFullConfig();
    const spy = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);

    const r = await sendAdminSms("🔴 festival prod: TypeError: boom — /api/x");
    expect(r).toEqual({ sid: "SM123" });

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    // Hits the account-scoped Messages endpoint.
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    // HTTP Basic auth = base64("sid:token").
    const expectedAuth = `Basic ${Buffer.from("ACtest:tok").toString("base64")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
    // Form-encoded To / From / Body.
    const body = new URLSearchParams(init.body as string);
    expect(body.get("To")).toBe("+14155551234");
    expect(body.get("From")).toBe("+15005550006");
    expect(body.get("Body")).toBe("🔴 festival prod: TypeError: boom — /api/x");
  });

  it("honors an explicit `to` override", async () => {
    setFullConfig();
    const spy = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ sid: "SM9" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", spy);
    await sendAdminSms("hi", { to: "+19998887777" });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(new URLSearchParams(init.body as string).get("To")).toBe("+19998887777");
  });

  it("throws on a non-2xx Twilio response so misconfig surfaces loudly", async () => {
    setFullConfig();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ message: "bad number" }), { status: 400 })),
    );
    await expect(sendAdminSms("x")).rejects.toThrow(/twilio 400/);
  });
});
