import { describe, expect, it } from "vitest";
import { formatNameList, studentFirstNames } from "@/lib/verify-copy";

describe("studentFirstNames", () => {
  it("returns OHS-student first names, trimmed and in order", () => {
    expect(
      studentFirstNames([
        { firstName: "  Maya ", grade: "9th" },
        { firstName: "Ravi", grade: "11th" },
      ]),
    ).toEqual(["Maya", "Ravi"]);
  });

  it("drops non-OHS children (the 'Not an OHS child' grade)", () => {
    expect(
      studentFirstNames([
        { firstName: "Maya", grade: "9th" },
        { firstName: "Theo", grade: "Not an OHS child" },
      ]),
    ).toEqual(["Maya"]);
  });

  it("drops children with no usable grade (unknown OHS status)", () => {
    expect(
      studentFirstNames([
        { firstName: "Maya", grade: "9th" },
        { firstName: "Blank", grade: "" },
        { firstName: "Null", grade: null },
      ]),
    ).toEqual(["Maya"]);
  });

  it("drops children with no usable first name", () => {
    expect(
      studentFirstNames([
        { firstName: "", grade: "9th" },
        { firstName: null, grade: "10th" },
        { firstName: "Maya", grade: "11th" },
      ]),
    ).toEqual(["Maya"]);
  });

  it("de-dupes case-insensitively, keeping the first spelling", () => {
    expect(
      studentFirstNames([
        { firstName: "Maya", grade: "9th" },
        { firstName: "maya", grade: "10th" },
      ]),
    ).toEqual(["Maya"]);
  });

  it("returns [] when there's nothing to personalize with", () => {
    expect(studentFirstNames([])).toEqual([]);
    expect(studentFirstNames([{ firstName: "Theo", grade: "Not an OHS child" }])).toEqual([]);
  });
});

describe("formatNameList", () => {
  it("formats zero, one, two, and many names", () => {
    expect(formatNameList([])).toBe("");
    expect(formatNameList(["Maya"])).toBe("Maya");
    expect(formatNameList(["Maya", "Ravi"])).toBe("Maya or Ravi");
    expect(formatNameList(["Maya", "Ravi", "Sol"])).toBe("Maya, Ravi, or Sol");
  });

  it("supports an 'and' conjunction", () => {
    expect(formatNameList(["Maya", "Ravi"], "and")).toBe("Maya and Ravi");
    expect(formatNameList(["Maya", "Ravi", "Sol"], "and")).toBe("Maya, Ravi, and Sol");
  });
});
