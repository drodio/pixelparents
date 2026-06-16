import { describe, expect, it } from "vitest";
import { apiRequestSchema } from "@/lib/validation";

describe("apiRequestSchema", () => {
  it("accepts a well-formed request and trims whitespace", () => {
    const parsed = apiRequestSchema.parse({
      intended_use: "  A dashboard of community stats  ",
    });
    expect(parsed.intended_use).toBe("A dashboard of community stats");
  });

  it("rejects empty intended_use", () => {
    expect(apiRequestSchema.safeParse({ intended_use: "" }).success).toBe(false);
    expect(apiRequestSchema.safeParse({ intended_use: "   " }).success).toBe(false);
  });

  it("rejects over-long intended_use", () => {
    const r = apiRequestSchema.safeParse({ intended_use: "x".repeat(2001) });
    expect(r.success).toBe(false);
  });
});
