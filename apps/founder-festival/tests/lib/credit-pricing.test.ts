import { describe, it, expect } from "vitest";
import { applyMarkup, SCORE_MARKUP } from "@/lib/credit-pricing";

describe("applyMarkup", () => {
  it("applies the SCORE_MARKUP to measured cost, rounded to whole cents", () => {
    expect(SCORE_MARKUP).toBe(10);
    expect(applyMarkup(13)).toBe(130);
    expect(applyMarkup(35)).toBe(350);
    expect(applyMarkup(0)).toBe(0);
    expect(applyMarkup(7.4)).toBe(74);
  });
  it("never returns a negative price", () => {
    expect(applyMarkup(-5)).toBe(0);
  });
});
