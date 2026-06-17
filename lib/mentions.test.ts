import { describe, expect, it } from "vitest";
import { renderCaption, extractMentionIds, serializeMention } from "@/lib/mentions";

describe("renderCaption", () => {
  it("returns a single text segment when there are no mentions", () => {
    expect(renderCaption("A day at the park")).toEqual([
      { kind: "text", text: "A day at the park" },
    ]);
  });

  it("splits text around a mention", () => {
    expect(renderCaption("Here's @[Devina](c1) playing")).toEqual([
      { kind: "text", text: "Here's " },
      { kind: "mention", name: "Devina", id: "c1" },
      { kind: "text", text: " playing" },
    ]);
  });

  it("handles multiple mentions and uuid-style ids", () => {
    const out = renderCaption("@[Devina](2f1e) and @[Sam Lee](9a-bc)");
    expect(out).toEqual([
      { kind: "mention", name: "Devina", id: "2f1e" },
      { kind: "text", text: " and " },
      { kind: "mention", name: "Sam Lee", id: "9a-bc" },
    ]);
  });

  it("returns empty array for empty/whitespace input", () => {
    expect(renderCaption("")).toEqual([]);
    expect(renderCaption("   ")).toEqual([]);
  });
});

describe("extractMentionIds", () => {
  it("returns distinct ids in order", () => {
    expect(extractMentionIds("@[A](c1) @[B](c2) @[A again](c1)")).toEqual(["c1", "c2"]);
  });
  it("returns [] when there are none", () => {
    expect(extractMentionIds("just text")).toEqual([]);
  });
});

describe("serializeMention", () => {
  it("builds a marker", () => {
    expect(serializeMention("Devina", "c1")).toBe("@[Devina](c1)");
  });
});
