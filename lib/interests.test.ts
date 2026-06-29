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

  // The pool comes from an unordered SQL result set, so the winner must not
  // depend on insertion order even when 3+ equal-frequency variants tie. The
  // tie-break is a strict (leading-capital, localeCompare) total order, so the
  // pairwise "keep the better" reduction is order-independent — assert that
  // every permutation of a 3-way tie yields the same canonical spelling.
  it("picks the same winner for every order of a 3-variant equal-frequency tie", () => {
    const variants: Array<[string, number]> = [
      ["soccer", 2],
      ["Soccer", 2],
      ["SOCCER", 2],
    ];
    const permutations: Array<Array<[string, number]>> = [
      [variants[0], variants[1], variants[2]],
      [variants[0], variants[2], variants[1]],
      [variants[1], variants[0], variants[2]],
      [variants[1], variants[2], variants[0]],
      [variants[2], variants[0], variants[1]],
      [variants[2], variants[1], variants[0]],
    ];
    const winners = permutations.map((p) => pickCanonicalFromCounts(new Map(p)));
    expect(new Set(winners).size).toBe(1);
    expect(winners[0]).toBe("Soccer");
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
