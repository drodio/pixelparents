import { describe, it, expect } from "vitest";
import { conflictVerdict } from "@/lib/conflict-verdict";

describe("conflictVerdict", () => {
  it("flags different people when surnames differ (the mis-link case)", () => {
    expect(conflictVerdict(["Avery Bennett", "Avery Carlton"]).kind).toBe("different");
    expect(conflictVerdict(["Dana Stevens", "Dana Whitfield"]).kind).toBe("different");
    expect(conflictVerdict(["Toni Marsh", "Tony Calder"]).kind).toBe("different");
    expect(conflictVerdict(["Marcus deVries", "Marcus Holloway"]).kind).toBe("different");
  });

  it("calls it the same person when surnames match", () => {
    expect(conflictVerdict(["Casey Morgan", "Casey Morgan"]).kind).toBe("same");
    expect(conflictVerdict(["Sofía Valderrama", "Sofia Valderrama"]).kind).toBe("same"); // diacritics normalized
  });

  it("is uncertain without two usable surnames", () => {
    expect(conflictVerdict(["Zephyr", null]).kind).toBe("uncertain");
    expect(conflictVerdict(["Nadia R.", null]).kind).toBe("uncertain");
  });

  it("3-way: all distinct surnames → different", () => {
    expect(conflictVerdict(["Diego Vance", "Diego Rosario", "Diego Halloran"]).kind).toBe("different");
  });

  it("3-way: a repeated surname → uncertain (not cleanly all-distinct)", () => {
    expect(conflictVerdict(["Sam Lee", "Sam Lee", "Sam Park"]).kind).toBe("uncertain");
  });
});
