import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_FIELDS,
  canViewProfile,
  coerceShareVisibility,
  generateShareToken,
  sanitizeShareFields,
  shareFieldsOrDefault,
} from "@/lib/share";

describe("canViewProfile (the /p visibility gate)", () => {
  const cases = [
    // [visibility, isOwner, isOhsFamily, expected]
    ["ohs", false, false, false], // signed-out / non-family blocked
    ["ohs", false, true, true], // signed-in OHS family
    ["ohs", true, false, true], // owner always
    ["private", false, true, false], // only the owner
    ["private", true, false, true],
  ] as const;
  it.each(cases)("%s owner=%s ohs=%s -> %s", (v, isOwner, isOhsFamily, expected) => {
    expect(canViewProfile(v, { isOwner, isOhsFamily })).toBe(expected);
  });
});

describe("coerceShareVisibility", () => {
  it("keeps current tiers", () => {
    expect(coerceShareVisibility("ohs")).toBe("ohs");
    expect(coerceShareVisibility("private")).toBe("private");
  });

  it("downgrades legacy 'link' (removed public tier) to 'ohs'", () => {
    expect(coerceShareVisibility("link")).toBe("ohs");
  });

  it("falls back to 'private' for unknown/null values", () => {
    expect(coerceShareVisibility("bogus")).toBe("private");
    expect(coerceShareVisibility(null)).toBe("private");
    expect(coerceShareVisibility(undefined)).toBe("private");
  });
});

describe("shareFieldsOrDefault", () => {
  it("falls back to defaults only when never set (null/undefined)", () => {
    expect(shareFieldsOrDefault(null)).toEqual(DEFAULT_SHARE_FIELDS);
    expect(shareFieldsOrDefault(undefined)).toEqual(DEFAULT_SHARE_FIELDS);
  });

  it("honors an explicit empty selection (hide everything but the name)", () => {
    // [] is a deliberate choice, NOT 'unset' — must not resurrect defaults.
    expect(shareFieldsOrDefault([])).toEqual([]);
  });

  it("keeps valid stored fields and drops unknown keys", () => {
    expect(shareFieldsOrDefault(["photos", "bogus", "phone"])).toEqual(["photos", "phone"]);
  });

  it("returns a fresh copy of the defaults (not the shared constant)", () => {
    const a = shareFieldsOrDefault(null);
    a.push("photos");
    expect(shareFieldsOrDefault(null)).toEqual(DEFAULT_SHARE_FIELDS);
  });
});

describe("sanitizeShareFields", () => {
  it("drops unknown keys and non-arrays", () => {
    expect(sanitizeShareFields(["location", "nope", "email"])).toEqual(["location", "email"]);
    expect(sanitizeShareFields("location")).toEqual([]);
    expect(sanitizeShareFields(null)).toEqual([]);
    expect(sanitizeShareFields([1, 2, "photos"])).toEqual(["photos"]);
  });
});

describe("generateShareToken", () => {
  it("produces a 32-char url-safe token, unique per call", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
  });
});
