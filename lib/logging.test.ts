import { describe, it, expect } from "vitest";
import { redactContext, safeContext, truncateIp, coerceLevel, toCsv } from "./logging";

describe("redactContext", () => {
  it("redacts secret-ish keys at any depth, case-insensitively", () => {
    const out = redactContext({
      ok: "visible",
      password: "hunter2",
      CLERK_SECRET_KEY: "sk_live_x",
      nested: { apiKey: "k", deeper: { authorization: "Bearer x" } },
    }) as Record<string, unknown>;
    expect(out.ok).toBe("visible");
    expect(out.password).toBe("[REDACTED]");
    expect(out.CLERK_SECRET_KEY).toBe("[REDACTED]");
    const nested = out.nested as Record<string, unknown>;
    expect(nested.apiKey).toBe("[REDACTED]");
    expect((nested.deeper as Record<string, unknown>).authorization).toBe("[REDACTED]");
  });

  it("survives cycles instead of throwing", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = redactContext(a) as Record<string, unknown>;
    expect(out.name).toBe("a");
    expect(out.self).toBe("[Circular]");
  });

  it("clips very long strings but keeps the length visible", () => {
    const out = redactContext({ blob: "x".repeat(5_000) }) as Record<string, string>;
    expect(out.blob.length).toBeLessThan(2_100);
    expect(out.blob).toContain("5000 chars");
  });

  it("unwraps Errors into name/message/stack", () => {
    const out = redactContext(new Error("boom")) as Record<string, unknown>;
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
  });

  it("caps long arrays", () => {
    const out = redactContext(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(out).toHaveLength(100);
  });
});

describe("safeContext", () => {
  it("clips a single huge string via redaction, so it never hits the total cap", () => {
    const out = safeContext({ big: "y".repeat(100_000) });
    expect(out._truncated).toBeUndefined();
    expect(String(out.big).length).toBeLessThan(2_100);
  });

  it("hard-caps when MANY fields together exceed the size budget", () => {
    // Per-string clipping can't help here — each value is under the string
    // limit, but the object as a whole is not.
    const wide: Record<string, string> = {};
    for (let i = 0; i < 40; i++) wide[`field${i}`] = "z".repeat(1_000);
    const out = safeContext(wide);
    expect(out._truncated).toBe(true);
    expect(typeof out.preview).toBe("string");
    expect(Number(out._bytes)).toBeGreaterThan(16_000);
  });

  it("always returns an object, even for a primitive", () => {
    expect(safeContext("hello")).toEqual({ value: "hello" });
  });
});

describe("truncateIp", () => {
  it("drops the identifying last octet of IPv4", () => {
    expect(truncateIp("203.0.113.42")).toBe("203.0.113.0/24");
  });

  it("keeps only the IPv6 routing prefix", () => {
    expect(truncateIp("2001:db8:85a3:1234:5678:8a2e:370:7334")).toBe("2001:db8:85a3:1234::/64");
  });

  it("takes the client entry from an x-forwarded-for list", () => {
    expect(truncateIp("203.0.113.42, 70.41.3.18")).toBe("203.0.113.0/24");
  });

  it("is safe on null/garbage", () => {
    expect(truncateIp(null)).toBeNull();
    expect(truncateIp("")).toBeNull();
    expect(truncateIp("not-an-ip")).toBeNull();
  });
});

describe("coerceLevel", () => {
  it("passes known levels and defaults anything else to info", () => {
    expect(coerceLevel("error")).toBe("error");
    expect(coerceLevel("nonsense")).toBe("info");
    expect(coerceLevel(undefined)).toBe("info");
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines per RFC 4180", () => {
    const csv = toCsv([{ a: 'say "hi", ok', b: "line1\nline2" }], ["a", "b"]);
    expect(csv).toContain('"say ""hi"", ok"');
    expect(csv).toContain('"line1\nline2"');
  });

  it("serializes object cells and blanks nulls", () => {
    const csv = toCsv([{ a: { x: 1 }, b: null }], ["a", "b"]);
    expect(csv).toContain('"{""x"":1}"');
    expect(csv.trim().endsWith(",")).toBe(true);
  });

  it("returns just a header when there are no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });
});
