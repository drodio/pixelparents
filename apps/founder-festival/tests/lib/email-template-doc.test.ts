import { describe, it, expect } from "vitest";
import { templateToDoc } from "@/lib/email-template-doc";

describe("templateToDoc", () => {
  it("splits a plain line into a single paragraph of text", () => {
    const doc = templateToDoc("Hello there");
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Hello there" }],
    });
  });

  it("turns a {{key}} marker into a pill node surrounded by text", () => {
    const doc = templateToDoc("Hi {{first-name}}, welcome");
    expect(doc.content[0].content).toEqual([
      { type: "text", text: "Hi " },
      { type: "variablePill", attrs: { key: "first-name", max: null, fmt: null } },
      { type: "text", text: ", welcome" },
    ]);
  });

  it("parses a :max=N cap into the pill's max attribute", () => {
    const doc = templateToDoc("{{personalized-learnings:max=500}}");
    expect(doc.content[0].content).toEqual([
      { type: "variablePill", attrs: { key: "personalized-learnings", max: 500, fmt: null } },
    ]);
  });

  it("parses a :fmt=<id> modifier into the pill's fmt attribute", () => {
    const doc = templateToDoc("See you {{event-date:fmt=numeric}}");
    expect(doc.content[0].content).toEqual([
      { type: "text", text: "See you " },
      { type: "variablePill", attrs: { key: "event-date", max: null, fmt: "numeric" } },
    ]);
  });

  it("preserves newlines as separate paragraphs (incl. blank lines)", () => {
    const doc = templateToDoc("Line one\n\nLine three");
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0].content).toEqual([{ type: "text", text: "Line one" }]);
    expect(doc.content[1]).toEqual({ type: "paragraph" }); // empty
    expect(doc.content[2].content).toEqual([{ type: "text", text: "Line three" }]);
  });

  it("leaves an unknown variable marker as plain text", () => {
    const doc = templateToDoc("Hi {{not-a-var}}!");
    expect(doc.content[0].content).toEqual([{ type: "text", text: "Hi {{not-a-var}}!" }]);
  });

  it("always returns at least one paragraph for empty input", () => {
    expect(templateToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});
