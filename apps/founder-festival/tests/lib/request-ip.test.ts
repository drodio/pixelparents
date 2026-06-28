import { describe, it, expect } from "vitest";
import { getRequestIp } from "@/lib/request-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("getRequestIp", () => {
  it("uses the Vercel-set trusted header and takes the first hop", () => {
    expect(
      getRequestIp(h({ "x-vercel-forwarded-for": "1.2.3.4, 10.0.0.1" })),
    ).toBe("1.2.3.4");
  });

  it("trusts x-vercel-forwarded-for OVER spoofable x-forwarded-for/x-real-ip", () => {
    // An attacker can set x-forwarded-for / x-real-ip; they must not win.
    expect(
      getRequestIp(
        h({
          "x-vercel-forwarded-for": "9.9.9.9",
          "x-forwarded-for": "6.6.6.6",
          "x-real-ip": "7.7.7.7",
        }),
      ),
    ).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip then x-forwarded-for only when the trusted header is absent (dev)", () => {
    expect(getRequestIp(h({ "x-real-ip": "5.5.5.5" }))).toBe("5.5.5.5");
    expect(getRequestIp(h({ "x-forwarded-for": "8.8.8.8, 9.9.9.9" }))).toBe("8.8.8.8");
  });

  it("returns a sentinel when no IP headers are present", () => {
    expect(getRequestIp(h({}))).toBe("0.0.0.0");
  });
});
