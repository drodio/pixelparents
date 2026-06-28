import { describe, it, expect } from "vitest";
import { getExaClient, extractCandidateDomains } from "@/lib/exa";

describe("exa module", () => {
  it("getExaClient throws without EXA_API_KEY", () => {
    const original = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    try {
      expect(() => getExaClient()).toThrow(/EXA_API_KEY/);
    } finally {
      if (original) process.env.EXA_API_KEY = original;
    }
  });
});

describe("extractCandidateDomains", () => {
  it("pulls real company domains from highlights, URLs, and titles", () => {
    const found = extractCandidateDomains([
      {
        url: "https://crunchbase.com/person/jane",
        title: "Jane @ Acme",
        highlights: [
          "Jane founded acme.com in 2021",
          "Previously at OldCorp (oldcorp.io)",
        ],
      },
    ]);
    expect(found).toEqual(expect.arrayContaining(["acme.com", "oldcorp.io"]));
    // crunchbase.com is an aggregator host, not Jane's company → excluded.
    expect(found).not.toContain("crunchbase.com");
  });

  it("strips www. prefix", () => {
    const found = extractCandidateDomains([
      { url: "x", highlights: ["See www.example.com for details."] },
    ]);
    expect(found).toContain("example.com");
    expect(found).not.toContain("www.example.com");
  });

  // Regression: a profile HOSTED on a platform must not contribute that platform
  // as a "company domain" for the Majestic Million bonus. (Robin Harper was
  // getting GTM credit because linkedin.com is MM rank 6.)
  it("excludes platform / host / press / aggregator domains", () => {
    const found = extractCandidateDomains([
      {
        url: "https://www.linkedin.com/in/rharper",
        title: "Robin Harper - LinkedIn",
        highlights: [
          "Profile at linkedin.com/in/rharper",
          "github.com/rharper and a TechCrunch (techcrunch.com) feature",
          "Discussed on news.ycombinator.com",
          "Founder of realstartup.io",
        ],
      },
    ]);
    expect(found).toContain("realstartup.io"); // the actual company survives
    for (const platform of [
      "linkedin.com",
      "github.com",
      "techcrunch.com",
      "news.ycombinator.com",
      "ycombinator.com",
    ]) {
      expect(found).not.toContain(platform);
    }
  });
});
