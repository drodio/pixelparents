import { describe, it, expect } from "vitest";
import { parseRequestNumber, stampSubject } from "@/lib/claim-thread";
import { verifySvix } from "@/lib/svix-verify";
import crypto from "node:crypto";

describe("parseRequestNumber", () => {
  it("pulls the number out of the canonical subject", () => {
    expect(parseRequestNumber("RE: Your requested profile update (Request #12345)")).toBe(12345);
  });
  it("matches case-insensitively and tolerates extra spaces", () => {
    expect(parseRequestNumber("re: something (request # 10042 )")).toBe(10042);
  });
  it("matches without parentheses (some clients strip them)", () => {
    expect(parseRequestNumber("Re: update Request #99999 thanks")).toBe(99999);
  });
  it("returns null when no token is present", () => {
    expect(parseRequestNumber("Just a normal email")).toBeNull();
    expect(parseRequestNumber("order #42")).toBeNull(); // too short / not 'Request'
  });
});

describe("stampSubject", () => {
  it("appends the token when missing", () => {
    expect(stampSubject("Hello there", 10000)).toBe("Hello there (Request #10000)");
  });
  it("leaves the subject alone when the matching token already exists", () => {
    const s = "RE: profile (Request #10000)";
    expect(stampSubject(s, 10000)).toBe(s);
  });
  it("falls back to a default base when subject is empty", () => {
    expect(stampSubject("", 10001)).toBe("Your requested profile update (Request #10001)");
  });
});

describe("verifySvix", () => {
  const secret = "whsec_" + Buffer.from("super-secret-signing-key-1234567").toString("base64");
  const id = "msg_123";
  const timestamp = "1700000000";
  const body = JSON.stringify({ hello: "world" });

  function sign(s: string): string {
    const key = Buffer.from(s.slice(6), "base64");
    const mac = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
    return `v1,${mac}`;
  }

  it("accepts a correctly-signed request within tolerance", () => {
    const ok = verifySvix({
      secret,
      id,
      timestamp,
      signatureHeader: sign(secret),
      rawBody: body,
      nowSeconds: Number(timestamp) + 10,
    });
    expect(ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ok = verifySvix({
      secret,
      id,
      timestamp,
      signatureHeader: sign(secret),
      rawBody: body + "x",
      nowSeconds: Number(timestamp) + 10,
    });
    expect(ok).toBe(false);
  });

  it("rejects an out-of-tolerance timestamp", () => {
    const ok = verifySvix({
      secret,
      id,
      timestamp,
      signatureHeader: sign(secret),
      rawBody: body,
      nowSeconds: Number(timestamp) + 10_000,
    });
    expect(ok).toBe(false);
  });

  it("rejects when headers are missing", () => {
    expect(
      verifySvix({ secret, id: null, timestamp, signatureHeader: sign(secret), rawBody: body, nowSeconds: Number(timestamp) }),
    ).toBe(false);
  });
});
