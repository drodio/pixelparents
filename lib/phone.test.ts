import { describe, it, expect } from "vitest";
import { detectCountry, toE164, formatPhone, countryHint, isPlausiblePhone } from "./phone";

describe("detectCountry", () => {
  it("detects China from an explicit country code", () => {
    expect(detectCountry("+86 138 0013 8000")?.iso).toBe("CN");
  });

  it("does not let a short dial code shadow a longer one", () => {
    // +852 must not be read as +8, and +886 must not be read as +88.
    expect(detectCountry("+852 9123 4567")?.iso).toBe("HK");
    expect(detectCountry("+886 912 345 678")?.iso).toBe("TW");
  });

  it("treats a bare 10-digit number as US, which is what a US family types", () => {
    expect(detectCountry("2025550147")?.iso).toBe("US");
    expect(detectCountry("(202) 555-0147")?.iso).toBe("US");
  });

  it("returns null for an unlisted country rather than guessing", () => {
    // +505 (Nicaragua) isn't in the curated list. Unknown, NOT invalid.
    expect(detectCountry("+505 8888 8888")).toBeNull();
  });

  it("returns null rather than guessing at an ambiguous bare number", () => {
    expect(detectCountry("12345")).toBeNull();
  });
});

describe("never rejects international numbers", () => {
  // The whole point. The families most likely to type something unrecognised
  // are exactly the international families the school wants to reach, so
  // "unrecognised" must never mean "invalid".
  it("accepts numbers from countries it cannot name", () => {
    for (const n of ["+505 8888 8888", "+998 90 123 45 67", "+263 77 123 4567"]) {
      expect(detectCountry(n)).toBeNull();
      expect(isPlausiblePhone(n)).toBe(true);
    }
  });

  it("accepts recognised international numbers", () => {
    for (const n of ["+86 138 0013 8000", "+44 7700 900123", "+91 98765 43210"]) {
      expect(isPlausiblePhone(n)).toBe(true);
    }
  });

  it("rejects only things that cannot be phone numbers at all", () => {
    expect(isPlausiblePhone("")).toBe(false);
    expect(isPlausiblePhone("12345")).toBe(false); // too few digits
    expect(isPlausiblePhone("1234567890123456789")).toBe(false); // pasted by accident
  });
});

describe("toE164", () => {
  it("canonicalises a US number so two people who typed it differently match", () => {
    expect(toE164("(202) 555-0147")).toBe("+12025550147");
    expect(toE164("202-555-0147")).toBe("+12025550147");
    expect(toE164("+1 202 555 0147")).toBe("+12025550147");
  });

  it("applies a chosen country to a local number", () => {
    const cn = { iso: "CN", name: "China", dial: "+86", flag: "🇨🇳" };
    expect(toE164("13800138000", cn)).toBe("+8613800138000");
  });

  it("does not double a country code the member already typed", () => {
    const cn = { iso: "CN", name: "China", dial: "+86", flag: "🇨🇳" };
    expect(toE164("8613800138000", cn)).toBe("+8613800138000");
  });

  it("keeps an unrecognised number exactly as typed rather than mangling it", () => {
    expect(toE164("12345")).toBe("12345");
  });
});

describe("formatPhone", () => {
  it("groups US numbers the way everyone here reads them", () => {
    expect(formatPhone("2025550147")).toBe("+1 (202) 555-0147");
    expect(formatPhone("+1 202 555 0147")).toBe("+1 (202) 555-0147");
  });

  it("does not impose US grouping on a number from elsewhere", () => {
    expect(formatPhone("+86 13800138000")).toBe("+86 13800138000");
  });

  it("passes through anything it does not understand", () => {
    expect(formatPhone("ask me on WeChat")).toBe("ask me on WeChat");
  });
});

describe("countryHint", () => {
  it("names the country once it can tell", () => {
    expect(countryHint("+86 138 0013 8000")).toEqual({ flag: "🇨🇳", label: "China" });
  });

  it("shows nothing rather than a wrong flag", () => {
    expect(countryHint("+505 8888 8888")).toBeNull();
    expect(countryHint("")).toBeNull();
  });
});
