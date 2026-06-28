import { describe, it, expect } from "vitest";
import { registrableDomain, subjectDomainsFromHighlights } from "@/lib/enrichers/hackernews";

describe("registrableDomain", () => {
  it("strips scheme / www / path", () => {
    expect(registrableDomain("http://blog.rsloan.com/2011/08/12/x")).toBe("blog.rsloan.com");
    expect(registrableDomain("https://www.linkedin.com/in/foo")).toBe("linkedin.com");
    expect(registrableDomain("https://rsloan.dev")).toBe("rsloan.dev");
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
      fullName: "Riley Sloan",
      searchHighlights: urls.map((url) => ({ url, highlights: [] as string[] })),
    }) as never;

  it("keeps the subject's own domains and drops big platforms, ranked by frequency", () => {
    const domains = subjectDomainsFromHighlights(
      ctx([
        "http://blog.rsloan.com/a",
        "http://blog.rsloan.com/b", // blog.rsloan.com x2 → ranks first
        "https://rsloan.dev/x",
        "https://www.linkedin.com/in/rsloan", // denylisted
        "https://github.com/rsloan", // denylisted
        "https://news.ycombinator.com/user?id=Riley_Sloan", // denylisted
      ]),
    );
    expect(domains).toEqual(["blog.rsloan.com", "rsloan.dev"]);
  });

  it("returns [] when only platform domains are present", () => {
    expect(subjectDomainsFromHighlights(ctx(["https://twitter.com/x", "https://medium.com/@y"]))).toEqual([]);
  });
});
