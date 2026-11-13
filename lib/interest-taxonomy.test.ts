import { describe, it, expect } from "vitest";
import {
  categoryForInterest,
  groupInterests,
  relatedSuggestions,
  sharedTheme,
} from "./interest-taxonomy";
import { interestKey } from "./interest-split";
import { buildCanonicalMap } from "./interests";
import { rankInterestMatches } from "./interest-matching";

// The pool from the Nov 9 walkthrough screenshot.
const WALKTHROUGH_POOL = [
  "3d printing", "aerospace", "Biking", "Cars", "coding", "Culture", "Dispersed Camping",
  "Education", "Finance", "Food", "Healthy Lifestyle", "Hiking", "How machines work (documentaries etc)",
  "K-Pop", "Kite Boarding", "Learning AI", "Legos", "lord of the rings", "Math", "Mountain biking",
  "Movie", "Music", "Powerlifting", "Roller coasters", "Speed skating", "STEM", "Swimming",
  "Vibe code:basic", "Vibe Coding: Bolt", "Vibe Coding: Claude Code", "Working out",
];

describe("categoryForInterest", () => {
  it("puts every walkthrough interest in a named category", () => {
    const uncategorized = WALKTHROUGH_POOL.filter((i) => categoryForInterest(i).id === "other");
    expect(uncategorized).toEqual([]);
  });

  it("files representative interests where a person would look", () => {
    expect(categoryForInterest("Dispersed Camping").id).toBe("outdoors");
    expect(categoryForInterest("Hiking").id).toBe("outdoors");
    expect(categoryForInterest("Vibe Coding: Claude Code").id).toBe("tech");
    expect(categoryForInterest("Learning AI").id).toBe("tech");
    expect(categoryForInterest("Books: Percy Jackson").id).toBe("books");
    expect(categoryForInterest("Musical: Epic the Musical").id).toBe("music");
    expect(categoryForInterest("Powerlifting").id).toBe("sports");
    expect(categoryForInterest("Art").id).toBe("art");
  });

  it("falls back to Other for unknown interests and never matches 'ai' inside a word", () => {
    expect(categoryForInterest("Quilting bees").id).toBe("other");
    expect(categoryForInterest("Mountain biking").id).toBe("sports");
  });
});

describe("groupInterests", () => {
  it("keeps category order, preserves input order inside a group, and puts Other last", () => {
    const groups = groupInterests(["Zither", "Hiking", "Dispersed Camping", "Biking"]);
    expect(groups.map((g) => g.id)).toEqual(["outdoors", "sports", "other"]);
    expect(groups[0]!.items).toEqual(["Hiking", "Dispersed Camping"]);
  });
});

describe("relatedSuggestions", () => {
  it("finds differently-worded interests while typing", () => {
    expect(relatedSuggestions("cycling", WALKTHROUGH_POOL, new Set())).toEqual(["Biking", "Mountain biking"]);
    expect(relatedSuggestions("bike", WALKTHROUGH_POOL, new Set())).toEqual(["Biking", "Mountain biking"]);
    expect(relatedSuggestions("cycl", WALKTHROUGH_POOL, new Set())).toEqual(["Biking", "Mountain biking"]);
    expect(relatedSuggestions("programming", WALKTHROUGH_POOL, new Set())).toContain("coding");
    expect(relatedSuggestions("gym", WALKTHROUGH_POOL, new Set())).toEqual(
      expect.arrayContaining(["Powerlifting", "Working out", "Healthy Lifestyle"]),
    );
  });

  it("skips what is already shown and ignores very short queries", () => {
    expect(relatedSuggestions("cycling", WALKTHROUGH_POOL, new Set(["Biking"]))).toEqual(["Mountain biking"]);
    expect(relatedSuggestions("cy", WALKTHROUGH_POOL, new Set())).toEqual([]);
  });
});

describe("sharedTheme", () => {
  it("relates different titles in the same genre, not identical interests", () => {
    expect(sharedTheme("Book: Harry Potter", "Books: Percy Jackson")).toBe("fantasy");
    expect(sharedTheme("Biking", "Cycling")).toBe("cycling");
    expect(sharedTheme("Hiking", "hiking")).toBeNull();
    expect(sharedTheme("Chess", "Reading")).toBeNull();
  });
});

describe("interestKey", () => {
  it("treats a singular/plural label prefix as the same interest", () => {
    expect(interestKey("Books: Percy Jackson")).toBe(interestKey("Book: percy  jackson"));
    expect(interestKey("Book:Harry Potter")).toBe("book: harry potter");
  });

  it("does not merge anything else", () => {
    expect(interestKey("Cars")).not.toBe(interestKey("Car"));
    expect(interestKey("Yegge")).not.toBe(interestKey("Linus"));
    expect(interestKey("Book: Harry Potter")).not.toBe(interestKey("Book: Percy Jackson"));
  });

  it("collapses the near-duplicate in the shared pool", () => {
    const canonical = buildCanonicalMap(["Books: Harry Potter", "Book: Harry Potter", "Book: Harry Potter"]);
    expect([...new Set(canonical.values())]).toEqual(["Book: Harry Potter"]);
  });
});

describe("rankInterestMatches with related interests", () => {
  const cand = (signupId: string, interests: string[]) => ({
    signupId,
    token: null,
    name: signupId,
    isStudent: false,
    signalCount: 1,
    interests,
  });

  it("surfaces a family whose interests are only related, without inflating the shared score", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Book: Harry Potter"],
      candidates: [cand("a", ["Books: Percy Jackson"])],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(0);
    expect(out[0]!.relatedInterests).toEqual([
      { theirs: "Books: Percy Jackson", yours: "Book: Harry Potter", theme: "fantasy" },
    ]);
  });

  it("ranks exact overlap above related-only, and related above nothing", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Hiking", "Book: Harry Potter"],
      candidates: [
        cand("related", ["Books: Percy Jackson"]),
        cand("shared", ["hiking"]),
        cand("none", ["Chess"]),
      ],
    });
    expect(out.map((m) => m.signupId)).toEqual(["shared", "related"]);
  });

  it("counts a Book/Books spelling difference as an exact shared interest", () => {
    const out = rankInterestMatches({
      viewerInterests: ["Book: Harry Potter"],
      candidates: [cand("a", ["Books: Harry Potter"])],
    });
    expect(out[0]!.score).toBe(1);
    expect(out[0]!.relatedInterests).toEqual([]);
  });
});
