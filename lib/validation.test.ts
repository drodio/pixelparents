import { describe, expect, it } from "vitest";
import { keyRequestSchema } from "@/lib/validation";

describe("keyRequestSchema", () => {
  it("accepts a well-formed request and trims whitespace", () => {
    const parsed = keyRequestSchema.parse({
      name: "  Ada Lovelace  ",
      email: "ada@example.com",
      intended_use: "  A dashboard of community stats  ",
      label: "  prod  ",
    });
    expect(parsed.name).toBe("Ada Lovelace");
    expect(parsed.intended_use).toBe("A dashboard of community stats");
    expect(parsed.label).toBe("prod");
  });

  it("accepts a request without the optional label", () => {
    const parsed = keyRequestSchema.parse({
      name: "Ada",
      email: "ada@example.com",
      intended_use: "Exploring the API",
    });
    expect(parsed.label).toBeUndefined();
  });

  it("rejects a missing name", () => {
    const r = keyRequestSchema.safeParse({
      name: "   ",
      email: "ada@example.com",
      intended_use: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const r = keyRequestSchema.safeParse({
      name: "Ada",
      email: "not-an-email",
      intended_use: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty intended_use", () => {
    const r = keyRequestSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      intended_use: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects over-long free text", () => {
    const r = keyRequestSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      intended_use: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});
