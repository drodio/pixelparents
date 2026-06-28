import { describe, it, expect } from "vitest";
import {
  scoreThemHref,
  parseNameParam,
  MIN_SCORE_NAME_LENGTH,
} from "@/lib/score-them";

describe("scoreThemHref", () => {
  it("builds a /?home=1&name= link with the trimmed name", () => {
    expect(scoreThemHref("Tristan Pollock")).toBe(
      "/?home=1&name=Tristan%20Pollock",
    );
  });

  it("includes home=1 so the homepage doesn't redirect claimed users away", () => {
    expect(scoreThemHref("Jane Doe")).toContain("home=1");
  });

  it("trims surrounding whitespace before encoding", () => {
    expect(scoreThemHref("  Jane Doe  ")).toBe("/?home=1&name=Jane%20Doe");
  });

  it("encodes characters that are unsafe in a query string", () => {
    expect(scoreThemHref("Renée O'Brien & Co")).toBe(
      "/?home=1&name=Ren%C3%A9e%20O'Brien%20%26%20Co",
    );
  });
});

describe("parseNameParam", () => {
  it("round-trips a name written by scoreThemHref", () => {
    const href = scoreThemHref("Tristan Pollock");
    const search = href.slice(href.indexOf("?"));
    expect(parseNameParam(search)).toBe("Tristan Pollock");
  });

  it("returns the trimmed name when present and long enough", () => {
    expect(parseNameParam("?name=%20Jane%20")).toBe("Jane");
  });

  it("returns null when no name param is present", () => {
    expect(parseNameParam("?foo=bar")).toBeNull();
    expect(parseNameParam("")).toBeNull();
  });

  it("returns null for names shorter than the minimum", () => {
    expect(parseNameParam("?name=a")).toBeNull();
    expect(parseNameParam("?name=%20%20")).toBeNull();
  });

  it("accepts a name at exactly the minimum length", () => {
    const minName = "a".repeat(MIN_SCORE_NAME_LENGTH);
    expect(parseNameParam(`?name=${minName}`)).toBe(minName);
  });
});
