import { describe, it, expect } from "vitest";
import { hnLaunchFacts } from "@/lib/enrichers/hackernews";

const story = (title: string, points: number) => ({ objectID: title, title, points });

describe("hnLaunchFacts", () => {
  it("detects Show HN launches (and the strong ones) + the top one", () => {
    const f = hnLaunchFacts([
      story("Show HN: Acme CLI", 820),
      story("Show HN: tiny tool", 12),
      story("Ask HN: anyone hiring?", 40),
      story("A blog post", 5),
    ]).join("\n");
    expect(f).toMatch(/2 "Show HN" launch post\(s\), 1 with 50\+ points/);
    expect(f).toMatch(/Top: "Show HN: Acme CLI" \(820 pts\)/);
  });

  it("counts front-page (100+ pt) posts and tiers the message", () => {
    const f = hnLaunchFacts([story("Show HN: x", 150), story("y", 200), story("z", 99)]).join("\n");
    expect(f).toMatch(/2 HN post\(s\) scored 100\+ points/);
  });

  it("returns [] when there are no launches or front-page posts", () => {
    expect(hnLaunchFacts([story("just a comment thread link", 10), story("Ask HN: foo", 30)])).toEqual([]);
    expect(hnLaunchFacts([])).toEqual([]);
  });

  it("is case-insensitive on the Show HN prefix and ignores mid-title 'show hn'", () => {
    expect(hnLaunchFacts([story("SHOW HN: Big launch", 60)]).join("\n")).toMatch(/1 "Show HN"/);
    expect(hnLaunchFacts([story("I will show hn something later", 200)]).join("\n")).not.toMatch(/Show HN" launch/);
  });
});
