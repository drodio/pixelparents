import { describe, it, expect } from "vitest";
import {
  computeMatrix,
  dedupeByFullName,
  pickBestClaimPerEval,
  type MatrixCandidate,
} from "@/lib/founder-matrix";

// computeMatrix is pure (no DB), so these tests just construct fake
// candidates and assert ordering/exclusions on the three columns.

function makeCandidate(
  id: string,
  founderVector: number[],
  investorVector: number[] = [0, 0, 0, 0, 0],
  founderScore = 50,
  investorScore = 0,
): MatrixCandidate {
  return {
    evalId: id,
    fullName: `Person ${id}`,
    profileHref: `/profile/p/${id}`,
    imageUrl: null,
    founderScore,
    investorScore,
    founderVector,
    investorVector,
  };
}

describe("computeMatrix", () => {
  describe("similar (Most Like You)", () => {
    it("ranks by smallest Euclidean distance ascending", () => {
      const me = [99, 60, 40, 40, 90];
      const candidates = [
        makeCandidate("far", [10, 10, 10, 10, 10]),
        makeCandidate("close", [98, 58, 42, 42, 88]),
        makeCandidate("mid", [70, 50, 50, 50, 70]),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      expect(result.similar.map((m) => m.evalId)).toEqual(["close", "mid", "far"]);
    });

    it("excludes self", () => {
      const candidates = [
        makeCandidate("self", [99, 60, 40, 40, 90]),
        makeCandidate("other", [50, 50, 50, 50, 50]),
      ];
      const result = computeMatrix("self", [99, 60, 40, 40, 90], "founder", candidates);
      expect(result.similar.find((m) => m.evalId === "self")).toBeUndefined();
    });
  });

  describe("complement (Most Complimentary)", () => {
    it("picks candidates with high scores where mine are low", () => {
      const me = [99, 99, 10, 10, 10]; // strong on tech+traction, weak elsewhere
      const candidates = [
        // Mirror: high where I'm low, low where I'm high → strong complement
        makeCandidate("mirror", [10, 10, 99, 99, 99]),
        // Same as me → bad complement (no gap-fill)
        makeCandidate("twin", [99, 99, 10, 10, 10]),
        // Mid → mediocre complement
        makeCandidate("mid", [50, 50, 50, 50, 50]),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      expect(result.complement[0]?.evalId).toBe("mirror");
      expect(result.complement[result.complement.length - 1]?.evalId).toBe("twin");
    });
  });

  describe("opposite (Least Like You)", () => {
    it("ranks by largest Euclidean distance descending", () => {
      const me = [99, 99, 99, 99, 99];
      const candidates = [
        makeCandidate("far", [10, 10, 10, 10, 10]),
        makeCandidate("close", [95, 95, 95, 95, 95]),
        makeCandidate("mid", [50, 50, 50, 50, 50]),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      expect(result.opposite.map((m) => m.evalId)).toEqual(["far", "mid", "close"]);
    });
  });

  describe("eligibility", () => {
    it("excludes candidates whose dimension vector is all zeros", () => {
      const me = [99, 60, 40, 40, 90];
      const candidates = [
        makeCandidate("no-founder-signal", [0, 0, 0, 0, 0], [80, 80, 80, 80, 80], 0, 80),
        makeCandidate("real", [50, 50, 50, 50, 50]),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      const allIds = [
        ...result.similar.map((m) => m.evalId),
        ...result.complement.map((m) => m.evalId),
        ...result.opposite.map((m) => m.evalId),
      ];
      expect(allIds).not.toContain("no-founder-signal");
      expect(allIds).toContain("real");
    });

    it("uses investor vectors when dim is investor", () => {
      const me = [90, 90, 90, 90, 90];
      const candidates = [
        // Strong founder, no investor → excluded for investor dim
        makeCandidate("founder-only", [99, 99, 99, 99, 99], [0, 0, 0, 0, 0]),
        // Strong investor → eligible
        makeCandidate("investor-real", [0, 0, 0, 0, 0], [85, 85, 85, 85, 85], 0, 85),
      ];
      const result = computeMatrix("self", me, "investor", candidates);
      expect(result.similar.map((m) => m.evalId)).toEqual(["investor-real"]);
    });
  });

  describe("output shape", () => {
    it("caps each column at 5", () => {
      const me = [50, 50, 50, 50, 50];
      const candidates = Array.from({ length: 20 }, (_, i) =>
        makeCandidate(`c${i}`, [50 - i, 50, 50, 50, 50]),
      );
      const result = computeMatrix("self", me, "founder", candidates);
      expect(result.similar).toHaveLength(5);
      expect(result.complement).toHaveLength(5);
      expect(result.opposite).toHaveLength(5);
    });

    it("returns whatever exists when there are fewer than 5 candidates", () => {
      const me = [50, 50, 50, 50, 50];
      const candidates = [
        makeCandidate("a", [40, 40, 40, 40, 40]),
        makeCandidate("b", [60, 60, 60, 60, 60]),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      expect(result.similar).toHaveLength(2);
      expect(result.complement).toHaveLength(2);
      expect(result.opposite).toHaveLength(2);
    });

    it("displayScore picks the higher of founderScore / investorScore", () => {
      const me = [50, 50, 50, 50, 50];
      const candidates = [
        makeCandidate("founder-bigger", [50, 50, 50, 50, 50], [0, 0, 0, 0, 0], 80, 30),
        makeCandidate("investor-bigger", [50, 50, 50, 50, 50], [50, 50, 50, 50, 50], 40, 90),
      ];
      const result = computeMatrix("self", me, "founder", candidates);
      const fb = result.similar.find((m) => m.evalId === "founder-bigger");
      const ib = result.similar.find((m) => m.evalId === "investor-bigger");
      expect(fb?.displayScore).toBe(80);
      expect(ib?.displayScore).toBe(90);
    });
  });
});

describe("dedupeByFullName", () => {
  function c(
    id: string,
    fullName: string | null,
    score = 50,
    image: string | null = null,
  ): MatrixCandidate {
    return {
      evalId: id,
      fullName,
      profileHref: `/profile/${id}`,
      imageUrl: image,
      founderScore: score,
      investorScore: 0,
      founderVector: [50, 50, 50, 50, 50],
      investorVector: [0, 0, 0, 0, 0],
    };
  }

  it("collapses two candidates with the same fullName into one", () => {
    const out = dedupeByFullName([
      c("e1", "Sam Rivera", 90),
      c("e2", "Sam Rivera", 50),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.evalId).toBe("e1"); // higher score wins
  });

  it("prefers the candidate with a claimer image even at lower score", () => {
    const out = dedupeByFullName([
      c("e1", "Sam Rivera", 90),
      c("e2", "Sam Rivera", 50, "img"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.evalId).toBe("e2"); // image-having row wins
  });

  it("compares case-insensitively and ignores surrounding whitespace", () => {
    const out = dedupeByFullName([
      c("e1", "  sam rivera ", 50),
      c("e2", "Sam Rivera", 90),
    ]);
    expect(out).toHaveLength(1);
  });

  it("does NOT merge candidates with no fullName", () => {
    const out = dedupeByFullName([c("e1", null, 50), c("e2", null, 60)]);
    expect(out).toHaveLength(2);
  });

  it("keeps distinct names separate", () => {
    const out = dedupeByFullName([
      c("e1", "Alice", 50),
      c("e2", "Bob", 50),
      c("e3", "Alice", 60),
    ]);
    expect(out).toHaveLength(2);
    const alice = out.find((x) => x.fullName === "Alice");
    expect(alice?.evalId).toBe("e3");
  });
});

describe("pickBestClaimPerEval", () => {
  it("returns one entry per eval even with multiple claim rows", () => {
    const map = pickBestClaimPerEval([
      { evaluationId: "e1", clerkUsername: null, clerkImageUrl: null },
      { evaluationId: "e1", clerkUsername: "drodio", clerkImageUrl: "img" },
      { evaluationId: "e1", clerkUsername: null, clerkImageUrl: "img" },
    ]);
    expect(map.size).toBe(1);
    expect(map.get("e1")?.clerkUsername).toBe("drodio");
    expect(map.get("e1")?.clerkImageUrl).toBe("img");
  });

  it("prefers the row with a clerkUsername over one with just an image", () => {
    const map = pickBestClaimPerEval([
      { evaluationId: "e1", clerkUsername: null, clerkImageUrl: "img" },
      { evaluationId: "e1", clerkUsername: "drodio", clerkImageUrl: null },
    ]);
    expect(map.get("e1")?.clerkUsername).toBe("drodio");
  });

  it("prefers a row with an image when no row has a clerkUsername", () => {
    const map = pickBestClaimPerEval([
      { evaluationId: "e1", clerkUsername: null, clerkImageUrl: null },
      { evaluationId: "e1", clerkUsername: null, clerkImageUrl: "img" },
    ]);
    expect(map.get("e1")?.clerkImageUrl).toBe("img");
  });

  it("ignores rows with null evaluationId", () => {
    const map = pickBestClaimPerEval([
      { evaluationId: null, clerkUsername: "x", clerkImageUrl: "y" },
    ]);
    expect(map.size).toBe(0);
  });

  it("keeps entries for distinct evals separate", () => {
    const map = pickBestClaimPerEval([
      { evaluationId: "e1", clerkUsername: "a", clerkImageUrl: null },
      { evaluationId: "e2", clerkUsername: "b", clerkImageUrl: null },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("e1")?.clerkUsername).toBe("a");
    expect(map.get("e2")?.clerkUsername).toBe("b");
  });
});
