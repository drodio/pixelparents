import { describe, it, expect } from "vitest";
import { parseFounderStatus, parseStatuses } from "@/lib/founder-status-classify";

describe("parseStatuses", () => {
  it("parses two labeled lines", () => {
    expect(parseStatuses("founder: current\ninvestor: past")).toEqual({ founder: "current", investor: "past" });
  });
  it("is tolerant of casing/spacing", () => {
    expect(parseStatuses("Founder:  Never \nInvestor: Current")).toEqual({ founder: "never", investor: "current" });
  });
  it("returns null per dimension when a line is missing/garbage", () => {
    expect(parseStatuses("founder: current")).toEqual({ founder: "current", investor: null });
  });
});

describe("parseFounderStatus", () => {
  it("parses each single-word answer", () => {
    expect(parseFounderStatus("current")).toBe("current");
    expect(parseFounderStatus("past")).toBe("past");
    expect(parseFounderStatus("never")).toBe("never");
  });
  it("is case-insensitive and tolerates trailing punctuation/space", () => {
    expect(parseFounderStatus("Current.\n")).toBe("current");
    expect(parseFounderStatus("  NEVER ")).toBe("never");
  });
  it("returns null for an unrecognizable answer", () => {
    expect(parseFounderStatus("maybe")).toBeNull();
    expect(parseFounderStatus("")).toBeNull();
  });
});
