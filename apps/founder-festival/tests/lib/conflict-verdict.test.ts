import { describe, it, expect } from "vitest";
import { conflictVerdict } from "@/lib/conflict-verdict";

describe("conflictVerdict", () => {
  it("flags different people when surnames differ (the mis-link case)", () => {
    expect(conflictVerdict(["Adeola Ayoola", "Adeola Adesola"]).kind).toBe("different");
    expect(conflictVerdict(["Caroline Stevenson", "Caroline Webb"]).kind).toBe("different");
    expect(conflictVerdict(["Danni Shi", "Dani Friedland"]).kind).toBe("different");
    expect(conflictVerdict(["Francis deSouza", "Francis Maravilla"]).kind).toBe("different");
  });

  it("calls it the same person when surnames match", () => {
    expect(conflictVerdict(["Max Stoiber", "Max Stoiber"]).kind).toBe("same");
    expect(conflictVerdict(["María José Núñez", "Maria Jose Nunez"]).kind).toBe("same"); // diacritics normalized
  });

  it("is uncertain without two usable surnames", () => {
    expect(conflictVerdict(["Cher", null]).kind).toBe("uncertain");
    expect(conflictVerdict(["Gauri J.", null]).kind).toBe("uncertain");
  });

  it("3-way: all distinct surnames → different", () => {
    expect(conflictVerdict(["Omar Mohtar", "Omar Alfaro", "Omar Singh"]).kind).toBe("different");
  });

  it("3-way: a repeated surname → uncertain (not cleanly all-distinct)", () => {
    expect(conflictVerdict(["Sam Lee", "Sam Lee", "Sam Park"]).kind).toBe("uncertain");
  });
});
