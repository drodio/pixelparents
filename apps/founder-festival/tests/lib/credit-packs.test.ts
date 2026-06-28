import { describe, it, expect } from "vitest";
import { CREDIT_PACKS, packById } from "@/lib/credit-packs";

describe("credit packs", () => {
  it("offers the five operator-approved packs in cents", () => {
    expect(CREDIT_PACKS.map((p) => p.cents)).toEqual([2500, 5000, 10000, 50000, 100000]);
    expect(CREDIT_PACKS.every((p) => p.id && p.label)).toBe(true);
  });
  it("packById returns the pack or undefined", () => {
    expect(packById("usd_25")?.cents).toBe(2500);
    expect(packById("nope")).toBeUndefined();
  });
});
