import { describe, it, expect } from "vitest";
import { nameMatches, nameTokens } from "@/lib/name-match";

describe("nameMatches — must ACCEPT correct matches (no over-rejection)", () => {
  const accept: [string, string][] = [
    ["Taylor Brooks", "Taylor Brooks"], // exact
    ["Zoë Müller", "Zoe Muller"], // diacritics stripped
    ["Zoe Muller", "Zoë Müller"], // diacritics (reverse)
    ["Tómas R Vance", "Tomas Vance"], // middle initial dropped
    ["Robert Smith", "Bob Smith"], // nickname — last name carries it
    ["Alexander Brightwood", "Alex Brightwood"], // prefix nickname
    ["Li Haoran", "Haoran Li"], // name order swapped
    ["Taylor Brooks", "Taylor Brooks, CFA"], // extra suffix token
    ["Reinhardt Vasquez", "Reinhardt"], // candidate is first name only
    ["Marguerite DeLacroix", "Marguerite De Lacroix"], // spacing
    ["Taylor Brooks", "taylorbrooks"], // candidate.name fell back to the handle
    ["Omar K.", "Omar Karim"], // searched last name is just an initial → first carries it
  ];
  for (const [searched, candidate] of accept) {
    it(`accepts "${searched}" ↔ "${candidate}"`, () => {
      expect(nameMatches(searched, candidate)).toBe(true);
    });
  }
});

describe("nameMatches — must REJECT wrong people", () => {
  const reject: [string, string][] = [
    ["Taylor Brooks", "Riley Chen"], // the real-world bug that started this
    ["Devin Marsh", "Maria Gonzalez"],
    ["Sara Whitman", "Michael Brown"],
  ];
  for (const [searched, candidate] of reject) {
    it(`rejects "${searched}" ↔ "${candidate}"`, () => {
      expect(nameMatches(searched, candidate)).toBe(false);
    });
  }
});

describe("nameMatches — lenient on missing data", () => {
  it("accepts when the candidate name is empty (can't validate)", () => {
    expect(nameMatches("Taylor Brooks", "")).toBe(true);
  });
});

describe("nameTokens", () => {
  it("strips accents, initials, and suffixes", () => {
    expect(nameTokens("Tómas R Vance Jr.")).toEqual(["tomas", "vance"]);
  });
});
