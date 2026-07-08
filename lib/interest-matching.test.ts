import { describe, expect, it } from "vitest";
import { rankInterestMatches, type FamilyInterestCandidate } from "./interest-matching";

// Pure-logic coverage for the "families who share your interests" matcher. Mirrors
// lib/ask-matching.test.ts in spirit: deterministic, DB-free, and it locks in the
// "clubbing Yegge and Linus" guardrail — the matcher only counts a GENUINELY shared
// interest (same trim+lowercase key), never two different interests.

function cand(
  signupId: string,
  interests: string[],
  extra: Partial<FamilyInterestCandidate> = {},
): FamilyInterestCandidate {
  return {
    signupId,
    token: null,
    name: signupId,
    isStudent: false,
    interests,
    signalCount: interests.length,
    ...extra,
  };
}

describe("rankInterestMatches", () => {
  it("returns [] when the viewer has no interests (nothing to match on)", () => {
    expect(
      rankInterestMatches({ viewerInterests: [], candidates: [cand("a", ["Chess"])] }),
    ).toEqual([]);
  });

  it("ranks by shared-interest count, descending", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess", "Robotics", "Hiking"],
      candidates: [
        cand("one", ["Chess"]),
        cand("three", ["Chess", "Robotics", "Hiking"]),
        cand("two", ["Chess", "Hiking"]),
      ],
    });
    expect(out.map((m) => m.signupId)).toEqual(["three", "two", "one"]);
    expect(out.map((m) => m.score)).toEqual([3, 2, 1]);
  });

  it("matches case-insensitively but reports the VIEWER's spelling in shared chips", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Mountain Biking"],
      candidates: [cand("a", ["mountain biking"])],
    });
    expect(out).toHaveLength(1);
    expect(out[0].sharedInterests).toEqual(["Mountain Biking"]);
  });

  it("drops candidates with zero overlap", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess"],
      candidates: [cand("no", ["Cooking"]), cand("yes", ["Chess"])],
    });
    expect(out.map((m) => m.signupId)).toEqual(["yes"]);
  });

  // The core "clubbing" regression: two DIFFERENT interests never count as shared.
  it("never treats two different interests as a shared match (Yegge vs Linus)", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Yegge"],
      candidates: [cand("linusfan", ["Linus"])],
    });
    // "Yegge" and "Linus" are different keys → no overlap → not suggested.
    expect(out).toEqual([]);
  });

  it("counts only the genuinely-shared interest when a family lists several", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Yegge", "Chess"],
      candidates: [cand("mix", ["Linus", "Chess", "Rust"])],
    });
    expect(out).toHaveLength(1);
    // Shares ONLY "Chess" — "Yegge" vs "Linus"/"Rust" is not a match.
    expect(out[0].score).toBe(1);
    expect(out[0].sharedInterests).toEqual(["Chess"]);
  });

  it("excludes the viewer + passed co-parent ids", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess"],
      candidates: [cand("self", ["Chess"]), cand("coparent", ["Chess"]), cand("other", ["Chess"])],
      excludeSignupIds: ["self", "coparent"],
    });
    expect(out.map((m) => m.signupId)).toEqual(["other"]);
  });

  it("tie-breaks equal overlap by signalCount desc, then name asc, then id asc", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess"],
      candidates: [
        cand("z", ["Chess"], { name: "Zed", signalCount: 1 }),
        cand("a", ["Chess"], { name: "Amy", signalCount: 1 }),
        cand("rich", ["Chess"], { name: "Rich", signalCount: 5 }),
      ],
    });
    // Richer profile first, then name asc among equal-signal.
    expect(out.map((m) => m.signupId)).toEqual(["rich", "a", "z"]);
  });

  it("de-dupes the viewer's own repeated interests (case-variants) before matching", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess", "chess", "CHESS"],
      candidates: [cand("a", ["Chess"])],
    });
    expect(out[0].score).toBe(1);
    expect(out[0].sharedInterests).toEqual(["Chess"]);
  });

  it("honors the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => cand(`c${i}`, ["Chess"]));
    const out = rankInterestMatches({ viewerInterests: ["Chess"], candidates: many, limit: 5 });
    expect(out).toHaveLength(5);
  });

  it("passes token + isStudent through for the card", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Chess"],
      candidates: [cand("a", ["Chess"], { token: "tok123", isStudent: true, name: "Kid" })],
    });
    expect(out[0]).toMatchObject({ token: "tok123", isStudent: true, name: "Kid" });
  });
});
