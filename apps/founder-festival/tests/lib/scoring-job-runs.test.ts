import { describe, it, expect } from "vitest";
import { cloneJobItemForRerun, runScore } from "@/lib/scoring-job-runs";

describe("cloneJobItemForRerun", () => {
  it("copies the inputs and resolves status from URL presence", () => {
    expect(
      cloneJobItemForRerun({ inputRaw: "Jane Doe, Acme", inputName: "Jane Doe", inputCompany: "Acme", linkedinUrl: "https://linkedin.com/in/jane" }),
    ).toEqual({
      inputRaw: "Jane Doe, Acme",
      inputName: "Jane Doe",
      inputCompany: "Acme",
      linkedinUrl: "https://linkedin.com/in/jane",
      status: "resolved", // has a URL → straight to scoring
    });
  });

  it("sends a URL-less item back to pending (re-resolve the handle)", () => {
    expect(
      cloneJobItemForRerun({ inputRaw: "Bob", inputName: "Bob", inputCompany: null, linkedinUrl: null }).status,
    ).toBe("pending");
  });
});

describe("runScore", () => {
  it("prefers the run's snapshot over the live eval", () => {
    expect(runScore(133, 285)).toBe(133); // historical run keeps its own number
  });

  it("treats a snapshot of 0 as a real value, not missing", () => {
    expect(runScore(0, 285)).toBe(0);
  });

  it("falls back to the live eval for legacy rows with no snapshot", () => {
    expect(runScore(null, 285)).toBe(285);
    expect(runScore(undefined, 285)).toBe(285);
  });

  it("returns null when neither is available", () => {
    expect(runScore(null, null)).toBeNull();
  });
});
