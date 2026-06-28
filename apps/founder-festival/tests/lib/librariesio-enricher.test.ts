import { describe, it, expect } from "vitest";
import { librariesIoFacts } from "@/lib/enrichers/librariesio";

describe("librariesIoFacts", () => {
  const repos = [
    { full_name: "jane/acme-cli", rank: 24, stargazers_count: 4200, contributions_count: 87, fork: false },
    { full_name: "jane/tiny-util", rank: 12, stargazers_count: 30, contributions_count: 2, fork: false },
    { full_name: "jane/forked-thing", rank: 28, stargazers_count: 99999, fork: true }, // fork — excluded
    { full_name: "jane/no-rank", rank: 0, fork: false }, // rank 0 — excluded
  ];

  it("ranks by SourceRank, excludes forks + rank-0, and summarizes", () => {
    const f = librariesIoFacts("jane", repos).join("\n");
    expect(f).toMatch(/indexed 2 non-fork repos for @jane; top SourceRank 24, max contributors 87/);
    expect(f).toMatch(/acme-cli — SourceRank 24, 4,200★, 87 contributors/);
    expect(f).toMatch(/tiny-util — SourceRank 12/);
    expect(f).not.toMatch(/forked-thing/); // fork excluded
    expect(f).not.toMatch(/no-rank/); // rank 0 excluded
  });

  it("returns [] when nothing qualifies (all forks / rank 0)", () => {
    expect(librariesIoFacts("x", [{ full_name: "x/f", rank: 30, fork: true }])).toEqual([]);
    expect(librariesIoFacts("x", [{ full_name: "x/z", rank: 0, fork: false }])).toEqual([]);
    expect(librariesIoFacts("x", [])).toEqual([]);
  });

  it("falls back to github_contributions_count for the contributor figure", () => {
    const f = librariesIoFacts("y", [{ full_name: "y/lib", rank: 20, github_contributions_count: 41, fork: false }]).join("\n");
    expect(f).toMatch(/41 contributors/);
  });
});
