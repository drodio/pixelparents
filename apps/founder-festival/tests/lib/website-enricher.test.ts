import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enrichWithWebsite,
  normalizeWebsiteUrl,
  isPlatformHost,
  pickWebsiteUrl,
  extractTitle,
  extractMetaDescription,
  extractHeadings,
  extractVisibleSnippet,
  extractSocialLinks,
  websiteFacts,
} from "@/lib/enrichers/website";
import type { EnricherContext } from "@/lib/enrichers/types";

// Minimal EnricherContext factory — the website enricher only reads websiteUrl,
// linkedinPageText, and searchHighlights.
function ctx(overrides: Partial<EnricherContext> = {}): EnricherContext {
  return {
    linkedinUrl: "https://www.linkedin.com/in/jane-doe",
    linkedinHandle: "jane-doe",
    linkedinPageText: "",
    searchHighlights: [],
    fullName: "Jane Doe",
    ...overrides,
  };
}

const SAMPLE_HTML = `<!doctype html><html><head>
  <title>Jane Doe — Builder &amp; Investor</title>
  <meta name="description" content="I build developer tools and invest in seed-stage startups." />
  <style>.x{color:red}</style>
</head><body>
  <h1>Hi, I'm Jane</h1>
  <h2>What I do</h2>
  <p>I founded Acme and now angel-invest. Find me on
     <a href="https://github.com/janedoe">GitHub</a> and
     <a href="https://x.com/janedoe">Twitter</a>.</p>
  <script>console.log('ignore me')</script>
</body></html>`;

// Build a minimal Response-like object the enricher's readCapped + fetchHtml
// accept (no .body stream → falls back to .text()).
function htmlResponse(html: string, opts: { ok?: boolean; contentType?: string } = {}): Response {
  return {
    ok: opts.ok ?? true,
    body: null,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? (opts.contentType ?? "text/html") : null) },
    text: async () => html,
  } as unknown as Response;
}

describe("website enricher — pure helpers", () => {
  it("normalizeWebsiteUrl adds scheme + rejects junk", () => {
    expect(normalizeWebsiteUrl("https://acme.com/")).toBe("https://acme.com/");
    expect(normalizeWebsiteUrl("acme.com")).toBe("https://acme.com/");
    expect(normalizeWebsiteUrl("not a url")).toBeNull();
    expect(normalizeWebsiteUrl("ftp://x.com")).toBeNull();
    expect(normalizeWebsiteUrl("")).toBeNull();
    expect(normalizeWebsiteUrl(null)).toBeNull();
  });

  it("isPlatformHost flags known profile hosts", () => {
    expect(isPlatformHost("linkedin.com")).toBe(true);
    expect(isPlatformHost("github.com")).toBe(true);
    expect(isPlatformHost("blog.github.com")).toBe(true); // subdomain of a platform host
    expect(isPlatformHost("acme.com")).toBe(false);
    expect(isPlatformHost("janedoe.dev")).toBe(false);
  });

  it("pickWebsiteUrl prefers self-entered, else first non-platform URL", () => {
    expect(pickWebsiteUrl("acme.com", ["https://github.com/x"])).toBe("https://acme.com/");
    expect(pickWebsiteUrl(null, ["https://www.linkedin.com/in/x", "https://janedoe.dev"])).toBe(
      "https://janedoe.dev/",
    );
    expect(pickWebsiteUrl(null, ["https://www.linkedin.com/in/x"])).toBeNull();
    expect(pickWebsiteUrl(null, [])).toBeNull();
  });

  it("extracts title / description / headings / snippet / socials from HTML", () => {
    expect(extractTitle(SAMPLE_HTML)).toBe("Jane Doe — Builder & Investor");
    expect(extractMetaDescription(SAMPLE_HTML)).toBe(
      "I build developer tools and invest in seed-stage startups.",
    );
    expect(extractHeadings(SAMPLE_HTML)).toEqual(["Hi, I'm Jane", "What I do"]);
    const snippet = extractVisibleSnippet(SAMPLE_HTML);
    expect(snippet).toContain("Hi, I'm Jane");
    expect(snippet).not.toContain("ignore me"); // script stripped
    const socials = extractSocialLinks(SAMPLE_HTML);
    expect(socials).toContainEqual({ label: "GitHub", url: "https://github.com/janedoe" });
    expect(socials).toContainEqual({ label: "X/Twitter", url: "https://x.com/janedoe" });
  });

  it("websiteFacts assembles a fact list + dedup'd citations", () => {
    const { facts, citations, raw } = websiteFacts("https://acme.com/", [
      { url: "https://acme.com/", html: SAMPLE_HTML },
    ]);
    expect(facts[0]).toContain("Personal website: acme.com");
    expect(facts.some((f) => f.includes("Site title"))).toBe(true);
    expect(citations).toContain("https://acme.com/");
    expect((raw as { host: string }).host).toBe("acme.com");
  });
});

describe("enrichWithWebsite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no-url skip → no_data (note 'no website URL'), no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await enrichWithWebsite(ctx());
    expect(res.status).toBe("no_data");
    expect(res.note).toBe("no website URL");
    expect(res.facts).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ok: self-entered website → facts + ok status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      // /about 404s; homepage returns the sample.
      if (url.endsWith("/about")) return htmlResponse("", { ok: false });
      return htmlResponse(SAMPLE_HTML);
    });
    const res = await enrichWithWebsite(ctx({ websiteUrl: "https://acme.com" }));
    expect(res.status).toBe("ok");
    expect(res.source).toBe("website");
    expect(res.facts.length).toBeGreaterThan(1);
    expect(res.facts[0]).toContain("acme.com");
    expect(res.citations).toContain("https://acme.com/");
  });

  it("no_data: homepage not fetchable (non-OK response)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(htmlResponse("", { ok: false }));
    const res = await enrichWithWebsite(ctx({ websiteUrl: "https://acme.com" }));
    expect(res.status).toBe("no_data");
    expect(res.note).toBe("homepage not fetchable");
    expect(res.facts).toEqual([]);
  });

  it("no_data: page fetched but no usable content (only host line)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/about")) return htmlResponse("", { ok: false });
      // Empty-ish HTML: no title/desc/headings/text/socials.
      return htmlResponse("<html><head></head><body>   </body></html>");
    });
    const res = await enrichWithWebsite(ctx({ websiteUrl: "https://acme.com" }));
    expect(res.status).toBe("no_data");
    expect(res.note).toBe("no usable content");
  });

  it("error: fetch throws → error status with note", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await enrichWithWebsite(ctx({ websiteUrl: "https://acme.com" }));
    expect(res.status).toBe("error");
    expect(res.note).toContain("ECONNREFUSED");
    expect(res.facts).toEqual([]);
  });

  it("discovers a website from LinkedIn highlights when none self-entered", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/about")) return htmlResponse("", { ok: false });
      return htmlResponse(SAMPLE_HTML);
    });
    const res = await enrichWithWebsite(
      ctx({
        searchHighlights: [
          { url: "https://www.linkedin.com/in/jane-doe", highlights: ["see https://janedoe.dev for more"] },
        ],
      }),
    );
    expect(res.status).toBe("ok");
    expect(res.facts[0]).toContain("janedoe.dev");
  });
});
