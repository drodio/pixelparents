import { describe, it, expect } from "vitest";
import { deriveEvalStatus } from "@/lib/eval-pipeline";

// The profile-vs-not-this-round decision must key off the actual score, NOT
// signalQuality. Peter Cho earned 25 authoritative points (SEC Form D) yet was
// routed to /not-this-round because Claude rated his thin web footprint
// "low" signalQuality. signalQuality stays display-only metadata per the rubric.
describe("deriveEvalStatus", () => {
  it("shows the profile whenever a positive score was generated", () => {
    expect(deriveEvalStatus(25)).toBe("scored"); // Peter Cho — was hidden before
    expect(deriveEvalStatus(1)).toBe("scored");
    expect(deriveEvalStatus(500)).toBe("scored");
  });

  it("routes to low-signal only when no points were generated", () => {
    expect(deriveEvalStatus(0)).toBe("low-signal");
  });
});
