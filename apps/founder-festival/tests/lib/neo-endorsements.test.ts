import { describe, it, expect } from "vitest";
import { neoInvestorUrl } from "@/components/NeoEndorsements";

describe("neoInvestorUrl", () => {
  it("builds the neo.com investor deep link from a slug", () => {
    expect(neoInvestorUrl("02-dana-cole")).toBe("https://neo.com/investor/02-dana-cole");
  });

  it("encodes unexpected characters so the URL stays valid", () => {
    expect(neoInvestorUrl("a b/c")).toBe("https://neo.com/investor/a%20b%2Fc");
  });
});
