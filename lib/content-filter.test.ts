import { describe, it, expect } from "vitest";
import { checkContent, checkFields } from "./content-filter";

describe("checkContent", () => {
  it("allows ordinary community writing", () => {
    for (const s of [
      "Looking for a summer robotics program for my 10th grader.",
      "Happy to chat about college apps — I work in biotech.",
      "Our family bikes every weekend in the hills.",
    ]) {
      expect(checkContent(s).allowed).toBe(true);
    }
  });

  it("blocks profanity and NAMES the trigger", () => {
    const v = checkContent("this is fucking ridiculous", "post");
    expect(v.allowed).toBe(false);
    if (v.allowed) return;
    // The whole point: an unexplained rejection is unactionable.
    expect(v.message).toContain("Content policies do not permit");
    expect(v.message).toContain("post");
    expect(v.triggers.length).toBeGreaterThan(0);
  });

  it("catches obfuscated spellings a word list would miss", () => {
    expect(checkContent("fvck this").allowed).toBe(false);
  });

  it("names the field so a multi-input form points at the right box", () => {
    const v = checkContent("shit", "board title");
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.message).toContain("board title");
  });

  it("treats empty / whitespace / null as allowed", () => {
    expect(checkContent("").allowed).toBe(true);
    expect(checkContent("   ").allowed).toBe(true);
    expect(checkContent(null).allowed).toBe(true);
    expect(checkContent(undefined).allowed).toBe(true);
  });

  it("does not block innocent words containing a flagged substring", () => {
    // The Scunthorpe problem — a filter that fails this is worse than none,
    // because it blocks real families writing normal sentences.
    for (const s of [
      "I teach data analysis at the university",
      "She lives in Essex",
      "The assignment is due Friday",
      "Our class meets on Tuesdays",
      "He is a physical therapist",
    ]) {
      expect(checkContent(s).allowed).toBe(true);
    }
  });

  it("produces a stable message for the same input", () => {
    const a = checkContent("shit and fuck", "post");
    const b = checkContent("shit and fuck", "post");
    expect(a).toEqual(b);
  });
});

describe("checkFields", () => {
  it("passes when every field is clean", () => {
    expect(
      checkFields([
        { value: "Summer camps", label: "title" },
        { value: "Anyone have recommendations?", label: "body" },
      ]).allowed,
    ).toBe(true);
  });

  it("returns the FIRST failure, labelled with that field", () => {
    const v = checkFields([
      { value: "Summer camps", label: "title" },
      { value: "this is shit", label: "body" },
    ]);
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.message).toContain("body");
  });
});
