import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGithubContributions, githubContributionFacts, type GithubContributions } from "@/lib/enrichers/github";

const FULL: GithubContributions = {
  lastYearTotal: 1840,
  commits: 1200,
  pullRequests: 410,
  reviews: 230,
  restricted: 620,
  reposContributedTo: 14,
  publicGists: 12,
  hasSponsorsListing: true,
  sponsors: 8,
};

describe("githubContributionFacts (pure rendering)", () => {
  it("renders every facet when present", () => {
    const f = githubContributionFacts(FULL).join("\n");
    expect(f).toMatch(/1840 total — 1200 commits, 410 PRs, 230 code reviews/);
    expect(f).toMatch(/620 PRIVATE\/restricted contributions/);
    expect(f).toMatch(/SHIPS CODE that isn't publicly visible/);
    expect(f).toMatch(/14 external repos/);
    expect(f).toMatch(/12 public gists/);
    expect(f).toMatch(/GitHub Sponsors enabled with 8 sponsor/);
  });

  it("omits facets that are zero/false", () => {
    const facts = githubContributionFacts({
      lastYearTotal: 0, commits: 0, pullRequests: 0, reviews: 0,
      restricted: 0, reposContributedTo: 0, publicGists: 0, hasSponsorsListing: false, sponsors: 0,
    });
    expect(facts).toEqual([]);
  });

  it("private-contribution fact fires even when public totals are zero (the dormant-profile fix)", () => {
    const facts = githubContributionFacts({
      lastYearTotal: 0, commits: 0, pullRequests: 0, reviews: 0,
      restricted: 900, reposContributedTo: 0, publicGists: 0, hasSponsorsListing: false, sponsors: 0,
    });
    expect(facts.join("\n")).toMatch(/900 PRIVATE\/restricted/);
  });
});

describe("fetchGithubContributions (GraphQL parsing)", () => {
  const origToken = process.env.GITHUB_TOKEN;
  afterEach(() => {
    vi.unstubAllGlobals();
    if (origToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = origToken;
  });

  it("parses the contribution graph payload", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            user: {
              contributionsCollection: {
                contributionCalendar: { totalContributions: 1840 },
                totalCommitContributions: 1200,
                totalPullRequestContributions: 410,
                totalPullRequestReviewContributions: 230,
                restrictedContributionsCount: 620,
              },
              gists: { totalCount: 12 },
              hasSponsorsListing: true,
              sponsorshipsAsMaintainer: { totalCount: 8 },
              repositoriesContributedTo: { totalCount: 14 },
            },
          },
        }),
      })),
    );
    expect(await fetchGithubContributions("octocat")).toEqual(FULL);
  });

  it("returns null with no token (GraphQL requires auth — graceful no-op)", async () => {
    delete process.env.GITHUB_TOKEN;
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchGithubContributions("octocat")).toBeNull();
    expect(spy).not.toHaveBeenCalled(); // never even hits the network
  });

  it("returns null on an API error rather than throwing", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await fetchGithubContributions("octocat")).toBeNull();
  });
});
