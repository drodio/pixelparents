import { describe, it, expect } from "vitest";
import { registrableDomain, subjectDomainsFromHighlights } from "@/lib/enrichers/hackernews";

describe("registrableDomain", () => {
  it("strips scheme / www / path", () => {
    expect(registrableDomain("http://sam.odio.com/2011/08/12/x")).toBe("sam.odio.com");
    expect(registrableDomain("https://www.linkedin.com/in/foo")).toBe("linkedin.com");
    expect(registrableDomain("https://odio.dev")).toBe("odio.dev");
  });
  it("returns null for junk", () => {
    expect(registrableDomain("not-a-url")).toBeNull();
    expect(registrableDomain("http://localhost")).toBeNull();
  });
});

describe("subjectDomainsFromHighlights", () => {
  const ctx = (urls: string[]) =>
    ({
      linkedinUrl: "",
      linkedinHandle: "",
      linkedinPageText: "",
      fullName: "Samuel Odio",
      searchHighlights: urls.map((url) => ({ url, highlights: [] as string[] })),
    }) as never;

  it("keeps the subject's own domains and drops big platforms, ranked by frequency", () => {
    const domains = subjectDomainsFromHighlights(
      ctx([
        "http://sam.odio.com/a",
        "http://sam.odio.com/b", // sam.odio.com x2 → ranks first
        "https://odio.dev/x",
        "https://www.linkedin.com/in/samodio", // denylisted
        "https://github.com/samodio", // denylisted
        "https://news.ycombinator.com/user?id=Sam_Odio", // denylisted
      ]),
    );
    expect(domains).toEqual(["sam.odio.com", "odio.dev"]);
  });

  it("returns [] when only platform domains are present", () => {
    expect(subjectDomainsFromHighlights(ctx(["https://twitter.com/x", "https://medium.com/@y"]))).toEqual([]);
  });
});
