import { describe, it, expect } from "vitest";
import { parseVercelCredits } from "@/lib/spend/parse";

describe("parseVercelCredits", () => {
  it("parses the USD strings the /credits endpoint returns", () => {
    expect(parseVercelCredits({ balance: "4.18", total_used: "0.82" })).toEqual({
      balanceUsd: 4.18,
      totalUsedUsd: 0.82,
    });
  });

  it("accepts numeric fields too", () => {
    expect(parseVercelCredits({ balance: 2, total_used: 3 })).toEqual({
      balanceUsd: 2,
      totalUsedUsd: 3,
    });
  });

  it("defaults missing fields to zero", () => {
    expect(parseVercelCredits({})).toEqual({ balanceUsd: 0, totalUsedUsd: 0 });
  });
});
