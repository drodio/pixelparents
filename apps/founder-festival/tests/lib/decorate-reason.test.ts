import { describe, it, expect } from "vitest";
import { decorateReason, domainOf } from "@/lib/decorate-reason";

describe("decorateReason", () => {
  it("returns a single text chunk when there are no citations", () => {
    const out = decorateReason("Plain sentence.", []);
    expect(out).toEqual([{ kind: "text", text: "Plain sentence." }]);
  });

  it("returns an empty array for an empty reason", () => {
    expect(decorateReason("", [])).toEqual([]);
  });

  it("decorates a single phrase mid-sentence", () => {
    const out = decorateReason(
      "Raised $84.9M total in venture capital.",
      [{ phrase: "$84.9M", sources: ["https://techcrunch.com/x"] }],
    );
    expect(out).toEqual([
      { kind: "text", text: "Raised " },
      { kind: "phrase", text: "$84.9M", sources: ["https://techcrunch.com/x"] },
      { kind: "text", text: " total in venture capital." },
    ]);
  });

  it("handles a phrase at the start of the reason", () => {
    const out = decorateReason("Stripe is great.", [
      { phrase: "Stripe", sources: ["https://stripe.com"] },
    ]);
    expect(out[0]).toEqual({ kind: "phrase", text: "Stripe", sources: ["https://stripe.com"] });
    expect(out[1]).toEqual({ kind: "text", text: " is great." });
  });

  it("handles a phrase at the end of the reason", () => {
    const out = decorateReason("Founded Stripe.", [
      { phrase: "Stripe.", sources: ["https://stripe.com"] },
    ]);
    expect(out[out.length - 1]).toEqual({
      kind: "phrase",
      text: "Stripe.",
      sources: ["https://stripe.com"],
    });
  });

  it("decorates multiple phrases in order", () => {
    const out = decorateReason(
      "Raised $8M at Acme and $2M at Foo.",
      [
        { phrase: "$8M at Acme", sources: ["https://a.com"] },
        { phrase: "$2M at Foo", sources: ["https://b.com"] },
      ],
    );
    expect(out.filter((c) => c.kind === "phrase")).toEqual([
      { kind: "phrase", text: "$8M at Acme", sources: ["https://a.com"] },
      { kind: "phrase", text: "$2M at Foo", sources: ["https://b.com"] },
    ]);
  });

  it("silently drops phrases that don't appear in the reason text", () => {
    const out = decorateReason("Founded Acme.", [
      { phrase: "Founded Acme", sources: ["https://a.com"] },
      { phrase: "AcquiredByGoogle", sources: ["https://b.com"] }, // not present
    ]);
    expect(out.filter((c) => c.kind === "phrase")).toEqual([
      { kind: "phrase", text: "Founded Acme", sources: ["https://a.com"] },
    ]);
  });

  it("drops citations with empty sources arrays", () => {
    const out = decorateReason("Raised $1M.", [
      { phrase: "$1M", sources: [] },
    ]);
    expect(out).toEqual([{ kind: "text", text: "Raised $1M." }]);
  });

  it("only decorates the first occurrence of a repeated phrase", () => {
    const out = decorateReason(
      "Stripe acquired by Stripe.",
      [{ phrase: "Stripe", sources: ["https://stripe.com"] }],
    );
    const phrases = out.filter((c) => c.kind === "phrase");
    expect(phrases).toHaveLength(1);
  });

  it("resolves overlapping citations by preferring the outer (longer) span", () => {
    // Both phrases start at position 0; "Stripe.com Series A" is longer than
    // "Stripe", so it wins. The shorter overlapping one is dropped.
    const out = decorateReason(
      "Stripe.com Series A funding announcement.",
      [
        { phrase: "Stripe", sources: ["https://wikipedia.org/stripe"] },
        { phrase: "Stripe.com Series A", sources: ["https://techcrunch.com/x"] },
      ],
    );
    const phrases = out.filter((c) => c.kind === "phrase");
    expect(phrases).toHaveLength(1);
    expect(phrases[0]).toMatchObject({
      text: "Stripe.com Series A",
      sources: ["https://techcrunch.com/x"],
    });
  });

  it("resolves non-overlapping nested-looking citations correctly", () => {
    // First phrase ends before second begins → both kept.
    const out = decorateReason(
      "Founded Acme. Then founded Foo.",
      [
        { phrase: "Acme", sources: ["https://a.com"] },
        { phrase: "Foo", sources: ["https://b.com"] },
      ],
    );
    expect(out.filter((c) => c.kind === "phrase").map((c) => c.text)).toEqual([
      "Acme",
      "Foo",
    ]);
  });
});

describe("domainOf", () => {
  it("strips the www. prefix", () => {
    expect(domainOf("https://www.techcrunch.com/article")).toBe("techcrunch.com");
  });

  it("returns the bare hostname for non-www URLs", () => {
    expect(domainOf("https://crunchbase.com/x")).toBe("crunchbase.com");
  });

  it("falls back to the raw url string when parsing fails", () => {
    expect(domainOf("not a real url")).toBe("not a real url");
  });
});
