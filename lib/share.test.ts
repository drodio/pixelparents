import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARE_FIELDS,
  generateShareToken,
  sanitizeShareFields,
  shareFieldsOrDefault,
} from "@/lib/share";

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
