import { describe, it, expect } from "vitest";
import { pageviewsFact } from "@/lib/enrichers/wikipedia";

describe("pageviewsFact", () => {
  it("renders a magnitude fact above the noise floor", () => {
    expect(pageviewsFact(120_000)).toMatch(/~120,000 views\/month/);
    expect(pageviewsFact(1_000)).toMatch(/~1,000 views\/month/);
  });
  it("suppresses below 1,000/month (noise) and null", () => {
    expect(pageviewsFact(999)).toBeNull();
    expect(pageviewsFact(0)).toBeNull();
    expect(pageviewsFact(null)).toBeNull();
  });
});
