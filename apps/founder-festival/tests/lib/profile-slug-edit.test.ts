import { describe, it, expect } from "vitest";
import {
  validateSlug,
  validateNickname,
  validateSlugKind,
  validateWebsiteUrl,
} from "@/lib/profile-slug-validate";

describe("validateSlug", () => {
  it("accepts simple lowercase slugs with hyphens", () => {
    expect(validateSlug("daniel-odio")).toEqual({ ok: true, value: "daniel-odio" });
    expect(validateSlug("abc")).toEqual({ ok: true, value: "abc" });
    expect(validateSlug("a-b-c")).toEqual({ ok: true, value: "a-b-c" });
    expect(validateSlug("user123")).toEqual({ ok: true, value: "user123" });
  });

  it("normalizes to lowercase and trims whitespace", () => {
    expect(validateSlug("  Daniel-Odio  ")).toEqual({ ok: true, value: "daniel-odio" });
    expect(validateSlug("ABC")).toEqual({ ok: true, value: "abc" });
  });

  it("rejects empty / whitespace-only / non-string input", () => {
    expect(validateSlug("")).toEqual({ ok: false, error: "slug_empty" });
    expect(validateSlug("   ")).toEqual({ ok: false, error: "slug_empty" });
    expect(validateSlug(null)).toEqual({ ok: false, error: "slug_empty" });
    expect(validateSlug(123 as unknown)).toEqual({ ok: false, error: "slug_empty" });
  });

  it("rejects slugs with bad characters", () => {
    expect(validateSlug("hello world")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("hello_world")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("hello.world")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("café")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("emoji-🎉")).toEqual({ ok: false, error: "slug_invalid_chars" });
  });

  it("rejects leading/trailing/consecutive hyphens", () => {
    expect(validateSlug("-daniel")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("daniel-")).toEqual({ ok: false, error: "slug_invalid_chars" });
    expect(validateSlug("daniel--odio")).toEqual({ ok: false, error: "slug_invalid_chars" });
  });

  it("rejects slugs over 64 chars", () => {
    expect(validateSlug("a".repeat(65))).toEqual({ ok: false, error: "slug_too_long" });
    expect(validateSlug("a".repeat(64))).toEqual({ ok: true, value: "a".repeat(64) });
  });

  it("rejects reserved slugs", () => {
    expect(validateSlug("admin")).toEqual({ ok: false, error: "slug_reserved" });
    expect(validateSlug("API")).toEqual({ ok: false, error: "slug_reserved" }); // case-insensitive
    expect(validateSlug("founder")).toEqual({ ok: false, error: "slug_reserved" });
    expect(validateSlug("investor")).toEqual({ ok: false, error: "slug_reserved" });
    expect(validateSlug("account")).toEqual({ ok: false, error: "slug_reserved" });
  });
});

describe("validateNickname", () => {
  it("accepts ordinary names + unicode", () => {
    expect(validateNickname("Dana")).toEqual({ ok: true, value: "Dana" });
    expect(validateNickname("DROdio")).toEqual({ ok: true, value: "DROdio" });
    expect(validateNickname("Mary Beth")).toEqual({ ok: true, value: "Mary Beth" });
    expect(validateNickname("André")).toEqual({ ok: true, value: "André" });
    expect(validateNickname("田中")).toEqual({ ok: true, value: "田中" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateNickname("  Dana  ")).toEqual({ ok: true, value: "Dana" });
  });

  it("treats null / undefined / empty as clearing the nickname", () => {
    expect(validateNickname(null)).toEqual({ ok: true, value: null });
    expect(validateNickname(undefined)).toEqual({ ok: true, value: null });
    expect(validateNickname("")).toEqual({ ok: true, value: null });
    expect(validateNickname("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects nicknames over 32 chars", () => {
    expect(validateNickname("a".repeat(33))).toEqual({ ok: false, error: "nickname_too_long" });
    expect(validateNickname("a".repeat(32))).toEqual({ ok: true, value: "a".repeat(32) });
  });

  it("rejects nicknames with control characters / newlines", () => {
    expect(validateNickname("line\nbreak")).toEqual({ ok: false, error: "nickname_invalid_chars" });
    expect(validateNickname("tab\there")).toEqual({ ok: false, error: "nickname_invalid_chars" });
    expect(validateNickname("null\x00byte")).toEqual({ ok: false, error: "nickname_invalid_chars" });
  });

  it("rejects non-string input that isn't null/undefined", () => {
    expect(validateNickname(123 as unknown)).toEqual({ ok: false, error: "nickname_invalid_chars" });
    expect(validateNickname({} as unknown)).toEqual({ ok: false, error: "nickname_invalid_chars" });
  });
});

describe("validateSlugKind", () => {
  it("accepts the two valid roles", () => {
    expect(validateSlugKind("founder")).toEqual({ ok: true, value: "founder" });
    expect(validateSlugKind("investor")).toEqual({ ok: true, value: "investor" });
  });

  it("rejects anything else", () => {
    expect(validateSlugKind("Founder")).toEqual({ ok: false, error: "role_invalid" });
    expect(validateSlugKind("admin")).toEqual({ ok: false, error: "role_invalid" });
    expect(validateSlugKind("")).toEqual({ ok: false, error: "role_invalid" });
    expect(validateSlugKind(null)).toEqual({ ok: false, error: "role_invalid" });
  });
});

describe("validateWebsiteUrl", () => {
  it("clears the field on null / blank", () => {
    expect(validateWebsiteUrl(null)).toEqual({ ok: true, value: null });
    expect(validateWebsiteUrl("")).toEqual({ ok: true, value: null });
    expect(validateWebsiteUrl("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts http(s) URLs and normalizes a bare host to https", () => {
    expect(validateWebsiteUrl("https://acme.com")).toEqual({ ok: true, value: "https://acme.com/" });
    expect(validateWebsiteUrl("http://acme.com/about")).toEqual({ ok: true, value: "http://acme.com/about" });
    expect(validateWebsiteUrl("acme.com")).toEqual({ ok: true, value: "https://acme.com/" });
  });

  it("rejects non-http schemes, hosts without a dot, and junk", () => {
    expect(validateWebsiteUrl("ftp://acme.com")).toEqual({ ok: false, error: "website_invalid" });
    expect(validateWebsiteUrl("javascript:alert(1)")).toEqual({ ok: false, error: "website_invalid" });
    expect(validateWebsiteUrl("localhost")).toEqual({ ok: false, error: "website_invalid" });
    expect(validateWebsiteUrl("not a url")).toEqual({ ok: false, error: "website_invalid" });
  });

  it("rejects over-long input", () => {
    expect(validateWebsiteUrl(`https://acme.com/${"a".repeat(2100)}`)).toEqual({
      ok: false,
      error: "website_too_long",
    });
  });
});
