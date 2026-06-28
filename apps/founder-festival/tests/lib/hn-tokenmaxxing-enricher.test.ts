import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichWithHnTokenmaxxing } from "@/lib/enrichers/hn-tokenmaxxing";

const SUBJECT_CTX = {
  linkedinUrl: "https://linkedin.com/in/drodio",
  linkedinHandle: "drodio",
  linkedinPageText: "",
  searchHighlights: [],
  fullName: "DROdio",
};

function mockFetch(usersJson: unknown, usageJson: unknown) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/users")) {
      return {
        ok: true,
        json: async () => usersJson,
      } as unknown as Response;
    }
    if (url.includes("/api/usage")) {
      return {
        ok: true,
        json: async () => usageJson,
      } as unknown as Response;
    }
    return { ok: false, json: async () => ({}) } as unknown as Response;
  });
}

describe("enrichWithHnTokenmaxxing", () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns empty when there's no known HN URL for the subject", async () => {
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, []);
    expect(res).toEqual({ source: "hn-tokenmaxxing", facts: [], citations: [] });
  });

  it("returns empty when the user isn't on the leaderboard", async () => {
    globalThis.fetch = mockFetch(
      { users: [{ username: "someoneelse", hn_username: "someoneelse" }] },
      { days: 28, rows: [] },
    );
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, [
      "https://news.ycombinator.com/user?id=drodio",
    ]);
    expect(res.facts).toEqual([]);
  });

  it("matches by hn_username when the leaderboard username differs", async () => {
    globalThis.fetch = mockFetch(
      {
        users: [
          { username: "wesm", hn_username: "wes-m", tools: "claude", projects: "duckdb,ibis" },
        ],
      },
      {
        days: 28,
        rows: [
          { username: "wesm", date: "2026-05-01", model: "opus", total_tokens: 5_000_000_000, cost: null },
        ],
      },
    );
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, [
      "https://news.ycombinator.com/user?id=wes-m",
    ]);
    expect(res.facts.length).toBeGreaterThan(0);
    expect(res.facts[0]).toContain("@wesm");
    expect(res.facts[0]).toContain("@wes-m"); // HN handle cited too
  });

  it("emits a rank fact when the user has usage rows", async () => {
    globalThis.fetch = mockFetch(
      { users: [{ username: "drodio", hn_username: "drodio" }] },
      {
        days: 28,
        rows: [
          { username: "drodio", date: "d", model: "m", total_tokens: 30_000_000_000, cost: null },
          { username: "other1", date: "d", model: "m", total_tokens: 50_000_000_000, cost: null },
          { username: "other2", date: "d", model: "m", total_tokens: 10_000_000_000, cost: null },
        ],
      },
    );
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, [
      "https://news.ycombinator.com/user?id=drodio",
    ]);
    const rankFact = res.facts.find((f) => /Ranked #/.test(f));
    expect(rankFact).toBeDefined();
    expect(rankFact).toContain("#2"); // drodio is 2nd at 30B
    expect(rankFact).toContain("30.0B");
  });

  it("returns just the 'listed' fact when on board but with no usage rows", async () => {
    globalThis.fetch = mockFetch(
      { users: [{ username: "drodio", hn_username: "drodio" }] },
      { days: 28, rows: [] },
    );
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, [
      "https://news.ycombinator.com/user?id=drodio",
    ]);
    expect(res.facts[0]).toContain("Listed on HN Tokenmaxxing");
    expect(res.facts.find((f) => /Ranked #/.test(f))).toBeUndefined();
  });

  it("returns empty when /api/users fetch fails", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) } as unknown as Response));
    const res = await enrichWithHnTokenmaxxing(SUBJECT_CTX, [
      "https://news.ycombinator.com/user?id=drodio",
    ]);
    expect(res.facts).toEqual([]);
  });
});
