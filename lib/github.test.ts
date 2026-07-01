import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listRecentCommits } from "@/lib/github";

// listRecentCommits does a raw fetch against the GitHub commits API and parses
// the result. We stub global.fetch so no network is hit.

const origFetch = global.fetch;

beforeEach(() => {
  process.env.GITHUB_ADMIN_TOKEN = "test-token";
});

afterEach(() => {
  global.fetch = origFetch;
  vi.restoreAllMocks();
});

function ghCommit(over: {
  sha: string;
  message: string;
  name?: string;
  login?: string | null;
  date?: string;
}) {
  return {
    sha: over.sha,
    html_url: `https://github.com/drodio/pixelparents/commit/${over.sha}`,
    commit: {
      message: over.message,
      author: { name: over.name ?? "Somebody", date: over.date ?? "2026-06-30T12:00:00Z" },
    },
    author: over.login === undefined ? { login: "somebody" } : over.login === null ? null : { login: over.login },
  };
}

describe("listRecentCommits", () => {
  it("returns [] with no token (never fetches)", async () => {
    delete process.env.GITHUB_ADMIN_TOKEN;
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = await listRecentCommits("2026-06-30T00:00:00Z");
    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses title/body/author/login from a single short page", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          ghCommit({
            sha: "a".repeat(40),
            message: "feat: add boards\n\nMore detail here.\nSecond line.",
            name: "Ansh Vasani",
            login: "a-finance-bro",
            date: "2026-06-30T10:00:00Z",
          }),
          // A commit not linked to a GH account → author is null → login null.
          ghCommit({ sha: "b".repeat(40), message: "chore: tidy", login: null, name: "Bot" }),
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const out = await listRecentCommits("2026-06-30T00:00:00Z");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      sha: "a".repeat(40),
      title: "feat: add boards",
      body: "More detail here.\nSecond line.",
      authorName: "Ansh Vasani",
      authorLogin: "a-finance-bro",
      date: "2026-06-30T10:00:00Z",
    });
    expect(out[0].url).toContain("/commit/");
    expect(out[1].authorLogin).toBeNull();
  });

  it("passes the since param and stops on a short page", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;
    await listRecentCommits("2026-06-30T00:00:00Z");
    expect(spy).toHaveBeenCalledTimes(1);
    const calledUrl = String((spy.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toContain("since=2026-06-30T00%3A00%3A00Z");
    expect(calledUrl).toContain("per_page=100");
  });

  it("returns [] on a non-2xx response (never throws)", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const out = await listRecentCommits("2026-06-30T00:00:00Z");
    expect(out).toEqual([]);
  });

  it("returns [] when fetch throws (never throws into the cron)", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const out = await listRecentCommits("2026-06-30T00:00:00Z");
    expect(out).toEqual([]);
  });
});
