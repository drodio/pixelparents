import { describe, expect, it } from "vitest";
import { rankCandidates, type HelperCandidate } from "@/lib/ask-matching";

// Minimal HelperCandidate factory — only the matched fields matter; the rest get
// harmless defaults (a non-student member with no signals).
function cand(overrides: Partial<HelperCandidate> = {}): HelperCandidate {
  return {
    signupId: "s1",
    token: null,
    name: "Member",
    isStudent: false,
    expertiseSignals: [],
    signalCount: 0,
    ...overrides,
  };
}

describe("rankCandidates", () => {
  it("returns [] when the ask has no tags", () => {
    const out = rankCandidates({
      askTags: [],
      candidates: [cand({ signupId: "a", expertiseSignals: ["AI", "chess"] })],
    });
    expect(out).toEqual([]);
  });

  it("returns [] when nothing overlaps", () => {
    const out = rankCandidates({
      askTags: ["robotics"],
      candidates: [cand({ signupId: "a", expertiseSignals: ["cooking"] })],
    });
    expect(out).toEqual([]);
  });

  it("scores by overlap count and surfaces overlap tags in ask order", () => {
    const out = rankCandidates({
      askTags: ["one", "two", "three"],
      candidates: [
        cand({ signupId: "hi", expertiseSignals: ["one", "two", "nope"] }),
        cand({ signupId: "lo", expertiseSignals: ["three"] }),
      ],
    });
    expect(out.map((m) => m.signupId)).toEqual(["hi", "lo"]);
    expect(out[0].score).toBe(2);
    expect(out[0].overlapTags).toEqual(["one", "two"]); // ask order preserved
    expect(out[1].score).toBe(1);
    expect(out[1].overlapTags).toEqual(["three"]);
  });

  it("includes student accounts on a match (Exchange: anyone can help)", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [cand({ signupId: "stu", isStudent: true, expertiseSignals: ["AI"] })],
    });
    expect(out.map((m) => m.signupId)).toEqual(["stu"]);
  });

  it("treats a non-student member as a helper too", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [cand({ signupId: "p", isStudent: false, expertiseSignals: ["AI"] })],
    });
    expect(out.map((m) => m.signupId)).toEqual(["p"]);
  });

  it("excludes the asker via excludeSignupId", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [
        cand({ signupId: "me", expertiseSignals: ["AI"] }),
        cand({ signupId: "you", expertiseSignals: ["AI"] }),
      ],
      excludeSignupId: "me",
    });
    expect(out.map((m) => m.signupId)).toEqual(["you"]);
  });

  it("matches case-insensitively and trims whitespace on both sides", () => {
    const out = rankCandidates({
      askTags: ["  Machine Learning "],
      candidates: [cand({ signupId: "a", expertiseSignals: ["machine learning"] })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].overlapTags).toEqual(["machine learning"]);
  });

  it("breaks score ties by signalCount desc (richer profile first)", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [
        cand({ signupId: "thin", expertiseSignals: ["AI"], signalCount: 1 }),
        cand({ signupId: "rich", expertiseSignals: ["AI"], signalCount: 9 }),
      ],
    });
    expect(out.map((m) => m.signupId)).toEqual(["rich", "thin"]);
  });

  it("breaks remaining ties by name asc then signupId asc", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [
        cand({ signupId: "c", name: "Zed", expertiseSignals: ["AI"], signalCount: 1 }),
        cand({ signupId: "a", name: "Ann", expertiseSignals: ["AI"], signalCount: 1 }),
        cand({ signupId: "b", name: "Ann", expertiseSignals: ["AI"], signalCount: 1 }),
      ],
    });
    // Ann (a) < Ann (b) by id < Zed (c) by name.
    expect(out.map((m) => m.signupId)).toEqual(["a", "b", "c"]);
  });

  it("respects the limit", () => {
    const out = rankCandidates({
      askTags: ["ai"],
      candidates: [
        cand({ signupId: "a", expertiseSignals: ["AI"], signalCount: 3 }),
        cand({ signupId: "b", expertiseSignals: ["AI"], signalCount: 2 }),
        cand({ signupId: "c", expertiseSignals: ["AI"], signalCount: 1 }),
      ],
      limit: 2,
    });
    expect(out.map((m) => m.signupId)).toEqual(["a", "b"]);
  });

  it("ignores duplicate and blank tags on both sides", () => {
    const out = rankCandidates({
      askTags: ["ai", "AI", " ", "", "ai"],
      candidates: [cand({ signupId: "a", expertiseSignals: ["ai", "AI", ""] })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe(1); // deduped to a single "ai"
    expect(out[0].overlapTags).toEqual(["ai"]);
  });
});
