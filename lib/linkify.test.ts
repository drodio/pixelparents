import { describe, expect, it } from "vitest";
import { linkifyToNodes, safeHref } from "@/lib/linkify";

// The linkifier's SAFETY guarantee is that non-URL text is emitted verbatim as
// plain-text segments (React escapes those on render) and only http(s)/www URLs
// become link segments. These tests exercise the pure parser + href builder.

describe("linkifyToNodes", () => {
  it("returns [] for empty / nullish input", () => {
    expect(linkifyToNodes("")).toEqual([]);
    expect(linkifyToNodes(null)).toEqual([]);
    expect(linkifyToNodes(undefined)).toEqual([]);
  });

  it("returns a single text segment when there is no URL", () => {
    expect(linkifyToNodes("just some plain text")).toEqual([
      { kind: "text", value: "just some plain text" },
    ]);
  });

  it("linkifies a bare https URL", () => {
    expect(linkifyToNodes("see https://example.com/x now")).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", href: "https://example.com/x", text: "https://example.com/x" },
      { kind: "text", value: " now" },
    ]);
  });

  it("linkifies a bare http URL", () => {
    const out = linkifyToNodes("http://a.test/path");
    expect(out).toEqual([
      { kind: "link", href: "http://a.test/path", text: "http://a.test/path" },
    ]);
  });

  it("linkifies a www. URL and gives it an https href", () => {
    const out = linkifyToNodes("go to www.example.com");
    expect(out).toEqual([
      { kind: "text", value: "go to " },
      { kind: "link", href: "https://www.example.com/", text: "www.example.com" },
    ]);
  });

  it("does not include trailing punctuation in the URL", () => {
    // Trailing ")." and "," must stay as plain text, not be swallowed by the URL.
    expect(linkifyToNodes("(see https://example.com/x).")).toEqual([
      { kind: "text", value: "(see " },
      { kind: "link", href: "https://example.com/x", text: "https://example.com/x" },
      { kind: "text", value: ")." },
    ]);
    expect(linkifyToNodes("visit https://example.com, ok?")).toEqual([
      { kind: "text", value: "visit " },
      { kind: "link", href: "https://example.com/", text: "https://example.com" },
      { kind: "text", value: ", ok?" },
    ]);
  });

  it("handles multiple URLs in one string", () => {
    const out = linkifyToNodes("a https://one.com b www.two.com c");
    expect(out).toEqual([
      { kind: "text", value: "a " },
      { kind: "link", href: "https://one.com/", text: "https://one.com" },
      { kind: "text", value: " b " },
      { kind: "link", href: "https://www.two.com/", text: "www.two.com" },
      { kind: "text", value: " c" },
    ]);
  });

  it("preserves newlines and whitespace in text runs", () => {
    const out = linkifyToNodes("line 1\n\nsee https://x.com\nend");
    expect(out).toEqual([
      { kind: "text", value: "line 1\n\nsee " },
      { kind: "link", href: "https://x.com/", text: "https://x.com" },
      { kind: "text", value: "\nend" },
    ]);
  });

  it("keeps text that merely mentions a scheme-less word as plain text (no XSS via javascript:)", () => {
    // A javascript: pseudo-URL is not matched by the URL regex at all — it stays
    // as plain text, so it can never become a live link.
    const out = linkifyToNodes("javascript:alert(1) is harmless here");
    expect(out).toEqual([
      { kind: "text", value: "javascript:alert(1) is harmless here" },
    ]);
  });

  it("does not treat an email-like token as a URL", () => {
    expect(linkifyToNodes("email me at a@b.com please")).toEqual([
      { kind: "text", value: "email me at a@b.com please" },
    ]);
  });
});

describe("safeHref", () => {
  it("passes through http(s) URLs", () => {
    expect(safeHref("https://example.com/x")).toBe("https://example.com/x");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
  });

  it("adds https:// to www. URLs", () => {
    expect(safeHref("www.example.com")).toBe("https://www.example.com/");
  });

  it("rejects non-http(s) schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("ftp://example.com")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});
