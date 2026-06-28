import { describe, it, expect } from "vitest";
import { nameMatches, nameTokens } from "@/lib/name-match";

describe("nameMatches — must ACCEPT correct matches (no over-rejection)", () => {
  const accept: [string, string][] = [
    ["Garry Tan", "Garry Tan"], // exact
    ["Urška Sršen", "Urska Srsen"], // diacritics stripped
    ["Urska Srsen", "Urška Sršen"], // diacritics (reverse)
    ["Máuhan M Zonoozy", "Mauhan Zonoozy"], // middle initial dropped
    ["Robert Smith", "Bob Smith"], // nickname — last name carries it
    ["Alexander Nevedovsky", "Alex Nevedovsky"], // prefix nickname
    ["Wang Siyuan", "Siyuan Wang"], // name order swapped
    ["Garry Tan", "Garry Tan, CFA"], // extra suffix token
    ["Helghardt Avenant", "Helghardt"], // candidate is first name only
    ["Caroline DeWitte", "Caroline De Witte"], // spacing
    ["Garry Tan", "garrytan"], // candidate.name fell back to the handle
    ["Khalid M.", "Khalid Mansour"], // searched last name is just an initial → first carries it
  ];
  for (const [searched, candidate] of accept) {
    it(`accepts "${searched}" ↔ "${candidate}"`, () => {
      expect(nameMatches(searched, candidate)).toBe(true);
    });
  }
});

describe("nameMatches — must REJECT wrong people", () => {
  const reject: [string, string][] = [
    ["Garry Tan", "Sergey E"], // the real-world bug that started this
    ["Ben Kownack", "Maria Gonzalez"],
    ["Elizabeth Yin", "Michael Brown"],
  ];
  for (const [searched, candidate] of reject) {
    it(`rejects "${searched}" ↔ "${candidate}"`, () => {
      expect(nameMatches(searched, candidate)).toBe(false);
    });
  }
});

describe("nameMatches — lenient on missing data", () => {
  it("accepts when the candidate name is empty (can't validate)", () => {
    expect(nameMatches("Garry Tan", "")).toBe(true);
  });
});

describe("nameTokens", () => {
  it("strips accents, initials, and suffixes", () => {
    expect(nameTokens("Máuhan M Zonoozy Jr.")).toEqual(["mauhan", "zonoozy"]);
  });
});
