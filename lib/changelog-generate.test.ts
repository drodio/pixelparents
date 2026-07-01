import { describe, it, expect, beforeEach } from "vitest";
import { generateChangelogEntries, type ModelCall } from "@/lib/changelog-generate";
import type { RecentCommit } from "@/lib/github";

// These tests run in the node-only suite (see vitest.config.ts) — DB-free. We
// inject a fake model so no network is hit, and set a gateway key so
// hasModelKey() is true (generateChangelogEntries returns [] with no key).

beforeEach(() => {
  process.env.VERCEL_AI_GATEWAY = "test-key";
});

// Build a commit with sensible defaults; override per-test.
function commit(over: Partial<RecentCommit> & { sha: string }): RecentCommit {
  return {
    title: "commit",
    body: "",
    authorName: "Somebody",
    authorLogin: "somebody",
    date: "2026-06-30T12:00:00Z",
    url: `https://github.com/drodio/pixelparents/commit/${over.sha}`,
    ...over,
  };
}

// A model that returns a fixed JSON string, ignoring the prompt.
const fixedModel =
  (json: string): ModelCall =>
  async () =>
    json;

describe("generateChangelogEntries", () => {
  it("returns [] with no commits (never calls the model)", async () => {
    let called = false;
    const model: ModelCall = async () => {
      called = true;
      return "[]";
    };
    const out = await generateChangelogEntries([], model);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("aggregates many small commits into a single entry", async () => {
    const commits = Array.from({ length: 8 }, (_, i) =>
      commit({ sha: `abc000${i}`.padEnd(40, "0"), title: `fix thing ${i}` }),
    );
    const shas = commits.map((c) => c.sha.slice(0, 7));
    const model = fixedModel(
      JSON.stringify([
        {
          title: "Minor fixes and tweaks",
          summary: "A batch of small fixes.",
          bullets: ["Fixed several small issues."],
          changeType: "bug_fix",
          categories: [],
          commitShas: shas,
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Minor fixes and tweaks");
    expect(out[0].commitShas).toHaveLength(8);
  });

  it("derives + dedupes authors from SHAs, keeping a null login as name-only", async () => {
    const commits = [
      commit({ sha: "a".repeat(40), authorName: "Ansh Vasani", authorLogin: "a-finance-bro" }),
      // Same author again (dupe by login) — should collapse to one.
      commit({ sha: "b".repeat(40), authorName: "Ansh Vasani", authorLogin: "a-finance-bro" }),
      // A commit with no linked GH account — login null, shown as name-only.
      commit({ sha: "c".repeat(40), authorName: "Casey Contributor", authorLogin: null }),
    ];
    const model = fixedModel(
      JSON.stringify([
        {
          title: "A shared effort",
          summary: "Multiple people shipped this.",
          bullets: [],
          changeType: "feature",
          categories: ["design"],
          commitShas: [
            commits[0].sha.slice(0, 7),
            commits[1].sha.slice(0, 7),
            commits[2].sha.slice(0, 7),
          ],
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out).toHaveLength(1);
    expect(out[0].authors).toEqual([
      { name: "Ansh Vasani", login: "a-finance-bro" },
      { name: "Casey Contributor", login: null },
    ]);
  });

  it("never lets the model invent an author not in the commit list", async () => {
    const commits = [
      commit({ sha: "d".repeat(40), authorName: "Real Person", authorLogin: "real-login" }),
    ];
    // Model output does not (and cannot) carry authors — attribution is in code.
    const model = fixedModel(
      JSON.stringify([
        {
          title: "One change",
          summary: "",
          bullets: [],
          changeType: "enhancement",
          categories: [],
          commitShas: [commits[0].sha.slice(0, 7)],
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out[0].authors).toEqual([{ name: "Real Person", login: "real-login" }]);
  });

  it("folds leftover (model-dropped) SHAs into a Minor fixes entry so none are lost", async () => {
    const commits = [
      commit({ sha: "1".repeat(40), title: "big feature", authorName: "A", authorLogin: "a" }),
      commit({ sha: "2".repeat(40), title: "dropped one", authorName: "B", authorLogin: "b" }),
      commit({ sha: "3".repeat(40), title: "dropped two", authorName: "C", authorLogin: "c" }),
    ];
    // Model only covers the first commit; the other two are leftovers.
    const model = fixedModel(
      JSON.stringify([
        {
          title: "Big feature",
          summary: "A notable new capability.",
          bullets: [],
          changeType: "feature",
          categories: [],
          commitShas: [commits[0].sha.slice(0, 7)],
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out).toHaveLength(2);
    const minor = out.find((e) => e.title === "Minor fixes and tweaks");
    expect(minor).toBeDefined();
    expect(minor!.commitShas.sort()).toEqual([commits[1].sha, commits[2].sha].sort());
    expect(minor!.authors.map((a) => a.login).sort()).toEqual(["b", "c"]);

    // Every input sha is assigned to exactly one entry.
    const allShas = out.flatMap((e) => e.commitShas);
    expect(new Set(allShas).size).toBe(3);
    expect(allShas.sort()).toEqual(commits.map((c) => c.sha).sort());
  });

  it("assigns each sha to exactly one entry even if two events claim the same sha", async () => {
    const commits = [
      commit({ sha: "e".repeat(40) }),
      commit({ sha: "f".repeat(40) }),
    ];
    // Both events list the FIRST sha; only the first event should get it, the
    // second falls back to the remaining unassigned sha.
    const model = fixedModel(
      JSON.stringify([
        {
          title: "First",
          summary: "",
          bullets: [],
          changeType: "enhancement",
          categories: [],
          commitShas: [commits[0].sha.slice(0, 7)],
        },
        {
          title: "Second",
          summary: "",
          bullets: [],
          changeType: "enhancement",
          categories: [],
          commitShas: [commits[0].sha.slice(0, 7), commits[1].sha.slice(0, 7)],
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    const allShas = out.flatMap((e) => e.commitShas);
    // No sha appears twice; both are covered.
    expect(allShas.length).toBe(2);
    expect(new Set(allShas).size).toBe(2);
  });

  it("uses the newest commit date as shippedAt and newest sha as representative", async () => {
    const commits = [
      commit({ sha: "0".repeat(40), date: "2026-06-01T00:00:00Z" }),
      commit({ sha: "9".repeat(40), date: "2026-06-15T00:00:00Z" }), // newest
    ];
    const model = fixedModel(
      JSON.stringify([
        {
          title: "Rollup",
          summary: "",
          bullets: [],
          changeType: "enhancement",
          categories: [],
          commitShas: commits.map((c) => c.sha.slice(0, 7)),
        },
      ]),
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out[0].shippedAt).toBe("2026-06-15T00:00:00.000Z");
    expect(out[0].commitSha).toBe("9".repeat(40));
    expect(out[0].slug).toContain("9999999");
  });

  it("drops invalid change types / non-existent categories and tolerates fenced JSON", async () => {
    const commits = [commit({ sha: "7".repeat(40) })];
    const model = fixedModel(
      "```json\n" +
        JSON.stringify([
          {
            title: "Odd one",
            summary: "",
            bullets: [],
            changeType: "not-a-type",
            categories: ["design", "totally-made-up"],
            commitShas: [commits[0].sha.slice(0, 7)],
          },
        ]) +
        "\n```",
    );
    const out = await generateChangelogEntries(commits, model);
    expect(out[0].changeType).toBe("enhancement"); // invalid → default
    expect(out[0].categories).toEqual(["design"]); // made-up slug filtered out
  });

  it("returns [] when the model throws (cron then no-ops)", async () => {
    const commits = [commit({ sha: "8".repeat(40) })];
    const model: ModelCall = async () => {
      throw new Error("gateway down");
    };
    const out = await generateChangelogEntries(commits, model);
    expect(out).toEqual([]);
  });
});
