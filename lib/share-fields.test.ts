import { describe, it, expect } from "vitest";
import { SHARE_FIELDS, shareFieldsFor } from "./share";

describe("shareFieldsFor", () => {
  it("gives parents the full list, unchanged", () => {
    const keys = shareFieldsFor({ isStudent: false }).map((f) => f.key);
    expect(keys).toEqual(SHARE_FIELDS.map((f) => f.key));
    expect(shareFieldsFor({ isStudent: false }).find((f) => f.key === "interests")?.label).toBe(
      "Parent interests",
    );
  });

  it("drops Children for students", () => {
    // A toggle that controls nothing is worse than an absent one: it implies
    // the account holds data it doesn't.
    const keys = shareFieldsFor({ isStudent: true }).map((f) => f.key);
    expect(keys).not.toContain("children");
  });

  it("relabels interests for students instead of removing them", () => {
    // A student HAS interests. Calling them "Parent interests" just makes the
    // setting look like it belongs to somebody else.
    const f = shareFieldsFor({ isStudent: true }).find((x) => x.key === "interests");
    expect(f).toBeDefined();
    expect(f?.label).toBe("Your interests");
  });

  it("never changes keys, only labels and visibility", () => {
    // Stored shareFields arrays are KEYS. If this ever relabels by mutating a
    // key, every member's saved choices silently stop matching and their
    // privacy settings change under them.
    const studentKeys = new Set(shareFieldsFor({ isStudent: true }).map((f) => f.key));
    const allKeys = new Set(SHARE_FIELDS.map((f) => f.key));
    for (const k of studentKeys) expect(allKeys.has(k)).toBe(true);
  });

  it("leaves a student's other privacy toggles intact", () => {
    const keys = shareFieldsFor({ isStudent: true }).map((f) => f.key);
    for (const k of ["location", "photos", "phone", "email", "wechat", "links"]) {
      expect(keys).toContain(k);
    }
  });
});
