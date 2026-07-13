import { describe, expect, it } from "vitest";
import {
  CHANGE_TYPES,
  CHANGELOG_CATEGORIES,
  SEED_ENTRIES,
  categoryLabel,
  changeTypeLabel,
  slugify,
} from "@/lib/changelog";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Sign in with GoPixel")).toBe("sign-in-with-gopixel");
  });

  it("collapses runs of non-alphanumerics and trims edges", () => {
    expect(slugify("  Faster   directory!! ")).toBe("faster-directory");
    expect(slugify("A/B — test")).toBe("a-b-test");
  });

  it("caps length at 60 chars", () => {
    expect(slugify("x".repeat(100)).length).toBe(60);
  });

  it("is stable (idempotent on an already-slug input)", () => {
    const s = slugify("Events tab with OHS calendar import");
    expect(slugify(s)).toBe(s);
  });
});

describe("labels", () => {
  it("maps known change types to labels", () => {
    expect(changeTypeLabel("feature")).toBe("Feature");
    expect(changeTypeLabel("bug_fix")).toBe("Bug Fix");
  });

  it("falls back to the raw value for unknown types", () => {
    expect(changeTypeLabel("mystery")).toBe("mystery");
  });

  it("maps known category slugs to labels", () => {
    expect(categoryLabel("developers")).toBe("Developer API");
    expect(categoryLabel("security")).toBe("Security");
  });

  it("falls back to the raw slug for unknown categories", () => {
    expect(categoryLabel("nope")).toBe("nope");
  });
});

describe("SEED_ENTRIES", () => {
  const validTypes = new Set(CHANGE_TYPES.map((t) => t.value));
  const validCats = new Set(CHANGELOG_CATEGORIES.map((c) => c.slug));

  it("ships ~12 entries", () => {
    expect(SEED_ENTRIES.length).toBeGreaterThanOrEqual(12);
  });

  it("has unique slugs", () => {
    const slugs = SEED_ENTRIES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every slug is already in canonical slug form", () => {
    for (const e of SEED_ENTRIES) {
      expect(e.slug).toBe(slugify(e.slug));
    }
  });

  it("uses only valid change types and categories", () => {
    for (const e of SEED_ENTRIES) {
      expect(validTypes.has(e.changeType)).toBe(true);
      expect(e.categories.length).toBeGreaterThan(0);
      for (const c of e.categories) expect(validCats.has(c)).toBe(true);
    }
  });

  it("has a parseable ISO shippedAt for every entry", () => {
    for (const e of SEED_ENTRIES) {
      expect(Number.isNaN(Date.parse(e.shippedAt))).toBe(false);
    }
  });

  it("has non-empty title and summary for every entry", () => {
    for (const e of SEED_ENTRIES) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.summary.trim().length).toBeGreaterThan(0);
    }
  });

  // PII guard: changelog entries describe FEATURES, never real people or contacts.
  it("contains no emails or phone numbers (PII scrub)", () => {
    const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    const phoneRe = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/;
    for (const e of SEED_ENTRIES) {
      const blob = [e.title, e.summary, ...e.bullets].join(" ");
      expect(emailRe.test(blob), `email-like text in ${e.slug}`).toBe(false);
      expect(phoneRe.test(blob), `phone-like text in ${e.slug}`).toBe(false);
    }
  });
});
