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

// The reported issue: "clubbing Yegge and Linus seems wildly off" — i.e. two
// clearly-different interests treated as the same. These pins prove the
// canonicalization layer can NEVER do that: it groups by trim+lowercase, so only
// genuine case/whitespace variants of the IDENTICAL spelling collapse. Two
// differently-spelled interests always stay distinct. If a "clubbing" is observed
// in the product it is a matching/display surface (see lib/interest-matching.ts),
// NOT this module.
describe("distinct interests never merge (Yegge vs Linus regression)", () => {
  it("keeps two genuinely-different interests as separate canonical entries", () => {
    const map = buildCanonicalMap(["Yegge", "Linus"]);
    // Two distinct keys → two distinct canonical spellings, never collapsed into one.
    expect(map.get("yegge")).toBe("Yegge");
    expect(map.get("linus")).toBe("Linus");
    expect(new Set(map.values()).size).toBe(2);
  });

  it("does not collapse interests that merely share a substring", () => {
    // "Chess" and "Chess Club" are different interests (different keys); one is not
    // a case-variant of the other, so canonicalization must keep both.
    const map = buildCanonicalMap(["Chess", "Chess Club"]);
    expect(map.get("chess")).toBe("Chess");
    expect(map.get("chess club")).toBe("Chess Club");
    expect(new Set(map.values()).size).toBe(2);
  });

  it("canonicalizeInterests preserves every distinct interest in the input", () => {
    const pool = ["Yegge", "Linus", "Rust", "Go"];
    // All four are distinct → all four survive, none merged.
    expect(canonicalizeInterests(["Yegge", "Linus", "Rust", "Go"], pool)).toEqual([
      "Yegge",
      "Linus",
      "Rust",
      "Go",
    ]);
  });

  it("merges ONLY true case-variants of the same spelling, side-by-side with distinct ones", () => {
    // "yegge"/"YEGGE" are case-variants of "Yegge" (one interest); "Linus" is a
    // separate interest. The case-variants collapse to one; "Linus" is untouched.
    const map = buildCanonicalMap(["Yegge", "yegge", "YEGGE", "Linus"]);
    expect(map.get("yegge")).toBe("Yegge"); // most-used spelling wins
    expect(map.get("linus")).toBe("Linus");
    expect(new Set(map.values()).size).toBe(2);
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

// The landing hero's "N shared interests" headline is now derived from
// getInterestPool().length — the SAME distinct pool that feeds the InterestTiles
// mosaic — instead of a separate child-only count query that under-counted by
// omitting parent interests the mosaic shows. getInterestPool() is DB-bound, but
// its distinct set is built by buildCanonicalMap over the parent+child union;
// this locks in that the derived count equals the number of distinct on-screen
// tiles, so the headline can never read smaller than the tiles a visitor sees.
describe("hero interests count = distinct pool size (parent + child union)", () => {
  // Mirrors getInterestPool: union every spelling from parents AND children,
  // collapse case-variants, and count the distinct canonical values.
  function poolSize(parentInterests: string[], childInterests: string[]): number {
    const canonical = buildCanonicalMap([...parentInterests, ...childInterests]);
    return new Set(canonical.values()).size;
  }

  it("counts a parent-only interest that a child-only count would miss", () => {
    // "Woodworking" exists only on a parent — the old child-only query dropped
    // it, so the headline read one lower than the mosaic. The pool-derived count
    // includes it.
    const size = poolSize(["Woodworking", "Chess"], ["Chess", "Robotics"]);
    expect(size).toBe(3); // Woodworking, Chess, Robotics
  });

  it("collapses case-variants across the parent/child boundary into one", () => {
    // Parent typed "Chess", child typed "chess" — one distinct interest, so the
    // tiles show one tile and the headline counts one.
    expect(poolSize(["Chess"], ["chess"])).toBe(1);
  });

  it("is empty when nobody has entered an interest", () => {
    expect(poolSize([], [])).toBe(0);
  });
});
