import { describe, expect, it } from "vitest";
import {
  buildCanonicalMap,
  canonicalizeInterests,
  pickCanonicalFromCounts,
} from "./interests";

describe("pickCanonicalFromCounts", () => {
  it("prefers the most-used spelling", () => {
    const counts = new Map([
      ["mountain biking", 1],
      ["Mountain Biking", 3],
    ]);
    expect(pickCanonicalFromCounts(counts)).toBe("Mountain Biking");
  });

  it("breaks frequency ties by preferring a leading capital", () => {
    const counts = new Map([
      ["soccer", 2],
      ["Soccer", 2],
    ]);
    expect(pickCanonicalFromCounts(counts)).toBe("Soccer");
  });

  it("is deterministic regardless of insertion order", () => {
    const a = new Map([
      ["Reading", 2],
      ["reading", 2],
    ]);
    const b = new Map([
      ["reading", 2],
      ["Reading", 2],
    ]);
    expect(pickCanonicalFromCounts(a)).toBe(pickCanonicalFromCounts(b));
  });
});

describe("buildCanonicalMap", () => {
  it("groups case-variants under one canonical spelling weighted by frequency", () => {
    const map = buildCanonicalMap([
      "Mountain Biking",
      "Mountain Biking",
      "mountain biking",
      "Chess",
    ]);
    expect(map.get("mountain biking")).toBe("Mountain Biking");
    expect(map.get("chess")).toBe("Chess");
  });
});

describe("canonicalizeInterests", () => {
  const pool = ["Mountain Biking", "Chess", "Robotics"];

  it("maps a typed case-variant onto the existing pool spelling", () => {
    expect(canonicalizeInterests(["mountain biking"], pool)).toEqual([
      "Mountain Biking",
    ]);
  });

  it("drops case-insensitive duplicates within the input, keeping first", () => {
    expect(
      canonicalizeInterests(["Chess", "chess", "CHESS"], pool),
    ).toEqual(["Chess"]);
  });

  it("passes brand-new interests through unchanged", () => {
    expect(canonicalizeInterests(["Surfing"], pool)).toEqual(["Surfing"]);
  });

  it("trims and ignores blanks", () => {
    expect(canonicalizeInterests(["  Robotics  ", "", "   "], pool)).toEqual([
      "Robotics",
    ]);
  });
});
