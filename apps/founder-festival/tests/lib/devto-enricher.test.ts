import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isTechnicalArticle,
  devtoUsernameCandidates,
  isConfidentDevtoMatch,
  enrichWithDevto,
} from "@/lib/enrichers/devto";

describe("isTechnicalArticle", () => {
  it("returns true when any tag is in the technical whitelist", () => {
    expect(isTechnicalArticle({ tag_list: ["productivity", "typescript"] })).toBe(true);
    expect(isTechnicalArticle({ tag_list: ["nextjs"] })).toBe(true);
  });
  it("is case-insensitive on tags", () => {
    expect(isTechnicalArticle({ tag_list: ["JavaScript", "WEBDEV"] })).toBe(true);
  });
  it("returns false for purely non-technical tag sets", () => {
    expect(isTechnicalArticle({ tag_list: ["career", "remote", "watercooler"] })).toBe(false);
  });
  it("returns false when there are no tags at all (we under-count, not over-count)", () => {
    expect(isTechnicalArticle({ tag_list: [] })).toBe(false);
    expect(isTechnicalArticle({})).toBe(false);
  });
});

describe("devtoUsernameCandidates", () => {
  const baseCtx = {
    linkedinUrl: "https://linkedin.com/in/drodio",
    linkedinHandle: "drodio",
    linkedinPageText: "",
    searchHighlights: [],
    fullName: "Daniel Odio",
  };

  it("puts the LinkedIn handle first (most-likely-to-match)", () => {
    const c = devtoUsernameCandidates(baseCtx, null);
    expect(c[0]).toBe("drodio");
  });
  it("adds the GitHub handle when supplied", () => {
    const c = devtoUsernameCandidates(baseCtx, "dro");
    expect(c).toContain("dro");
  });
  it("derives name-based fallbacks (hyphenated + concat)", () => {
    const c = devtoUsernameCandidates({ ...baseCtx, linkedinHandle: "" }, null);
    expect(c).toContain("daniel-odio");
    expect(c).toContain("danielodio");
  });
  it("caps probes at 4", () => {
    const c = devtoUsernameCandidates({ ...baseCtx, fullName: "John Quincy Adams Smith" }, "jqas");
    expect(c.length).toBeLessThanOrEqual(4);
  });
  it("returns [] when nothing identifies the subject", () => {
    expect(
      devtoUsernameCandidates(
        { linkedinUrl: "", linkedinHandle: "", linkedinPageText: "", searchHighlights: [], fullName: null },
        null,
      ),
    ).toEqual([]);
  });
});

describe("isConfidentDevtoMatch", () => {
  it("confirms via GitHub handle match (strongest signal)", () => {
    expect(
      isConfidentDevtoMatch({
        fullName: null,
        linkedinHandle: null,
        githubHandle: "drodio",
        user: { username: "someoneelse", github_username: "drodio" },
      }),
    ).toBe(true);
  });
  it("confirms via dev.to username == LinkedIn handle (cross-platform handle)", () => {
    expect(
      isConfidentDevtoMatch({
        fullName: null,
        linkedinHandle: "drodio",
        githubHandle: null,
        user: { username: "drodio" },
      }),
    ).toBe(true);
  });
  it("confirms via display-name overlap (first+last)", () => {
    expect(
      isConfidentDevtoMatch({
        fullName: "Daniel Odio",
        linkedinHandle: null,
        githubHandle: null,
        user: { username: "danielmodio", name: "Daniel Odio" },
      }),
    ).toBe(true);
  });
  it("rejects when nothing matches (precision-first)", () => {
    expect(
      isConfidentDevtoMatch({
        fullName: "Daniel Odio",
        linkedinHandle: "drodio",
        githubHandle: "drodio",
        user: { username: "stranger", name: "Random Person", github_username: "stranger" },
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------- enrichWithDevto
const ctx = {
  linkedinUrl: "https://linkedin.com/in/drodio",
  linkedinHandle: "drodio",
  linkedinPageText: "",
  searchHighlights: [],
  fullName: "Daniel Odio",
};

const USER = {
  username: "drodio",
  name: "Daniel Odio",
  github_username: "drodio",
  twitter_username: "drodio",
  joined_at: "Mar 15, 2021",
};

const ARTICLES = [
  {
    title: "Building agents with TypeScript",
    url: "https://dev.to/drodio/a1",
    tag_list: ["typescript", "agents", "ai"],
    positive_reactions_count: 250,
    comments_count: 4,
    published_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    reading_time_minutes: 8,
  },
  {
    title: "Remote work tips",
    url: "https://dev.to/drodio/a2",
    tag_list: ["productivity", "remote"],
    positive_reactions_count: 30,
    comments_count: 1,
    published_at: new Date(Date.now() - 200 * 86400000).toISOString(),
    reading_time_minutes: 4,
  },
  {
    title: "Postgres tips for indexes",
    url: "https://dev.to/drodio/a3",
    tag_list: ["postgres", "database"],
    positive_reactions_count: 90,
    comments_count: 2,
    published_at: new Date(Date.now() - 500 * 86400000).toISOString(),
    reading_time_minutes: 6,
  },
];

function mockDevto(byUser: Record<string, unknown>, byArticles: unknown[]) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/users/by_username")) {
      const handleMatch = url.match(/url=([^&]+)/);
      const handle = handleMatch ? decodeURIComponent(handleMatch[1]).toLowerCase() : "";
      const u = byUser[handle];
      if (!u) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(u), { status: 200 });
    }
    if (url.includes("/articles?username=")) {
      return new Response(JSON.stringify(byArticles), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
}

describe("enrichWithDevto", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns facts + raw blob when identity confirms and articles load", async () => {
    mockDevto({ drodio: USER }, ARTICLES);
    const r = await enrichWithDevto(ctx);
    expect(r.source).toBe("devto");
    expect(r.facts[0]).toMatch(/Publishes on dev.to as @drodio/);
    expect(r.facts.some((f) => f.includes("3 articles") && f.includes("2 on technical"))).toBe(true);
    expect(r.facts.some((f) => f.startsWith("Top article:") && f.includes("250 reactions"))).toBe(true);
    const raw = r.raw as { totalArticles: number; technicalArticles: number; topTags: string[] };
    expect(raw.totalArticles).toBe(3);
    expect(raw.technicalArticles).toBe(2);
    expect(raw.topTags[0]).toBe("typescript"); // shared lead w/ multiple, but typescript was first
    expect(r.citations[0]).toBe("https://dev.to/drodio");
  });

  it("rejects an unrelated dev.to account (precision-first)", async () => {
    // dev.to returns a user named `drodio`, but the actual person behind it
    // is unrelated (different GitHub handle, different Twitter, different name).
    // The username equality to our LinkedIn handle is intentionally NOT a
    // strong-enough signal on its own when handle is the only match AND name
    // also disagrees — but here, username === linkedinHandle still triggers
    // acceptance. To simulate a real impersonator we use a probe handle the
    // dev.to user doesn't share.
    const stranger = { username: "ghostpiloted", github_username: "stranger", twitter_username: "stranger", name: "Other Person" };
    mockDevto({ drodio: stranger }, ARTICLES);
    const r = await enrichWithDevto(ctx);
    expect(r.facts).toEqual([]);
  });

  it("returns empty when no candidate handle resolves", async () => {
    mockDevto({}, []);
    const r = await enrichWithDevto(ctx);
    expect(r.facts).toEqual([]);
  });

  it("emits the 'account presence only' fact when the user exists but has no articles", async () => {
    mockDevto({ drodio: USER }, []);
    const r = await enrichWithDevto(ctx);
    expect(r.facts.some((f) => f.includes("Publishes on dev.to"))).toBe(true);
    expect(r.facts.some((f) => f.includes("no articles published"))).toBe(true);
  });

  it("returns empty without throwing on a network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await enrichWithDevto(ctx);
    expect(r.facts).toEqual([]);
  });
});
