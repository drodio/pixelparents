import { describe, it, expect } from "vitest";
import { hnCitationsForReason } from "@/lib/eval-pipeline";

const hn = {
  handle: "drodio",
  profile_url: "https://news.ycombinator.com/user?id=drodio",
  submitted_url: "https://news.ycombinator.com/submitted?id=drodio",
  top_posts: [
    { title: "Show HN: Meteor, a realtime JavaScript framework", item_url: "https://news.ycombinator.com/item?id=111" },
    { title: "Nothing Changes Until You Do", item_url: "https://news.ycombinator.com/item?id=222" },
  ],
};

describe("hnCitationsForReason", () => {
  it("links a karma figure to the HN profile", () => {
    const c = hnCitationsForReason("Active on Hacker News with 1,080 karma over a 19-year-old account.", hn);
    expect(c).toContainEqual({ phrase: "1,080 karma", sources: [hn.profile_url] });
  });

  it("links a story-post count to the submissions feed", () => {
    const c = hnCitationsForReason("Active poster on HN with 287 story posts.", hn);
    expect(c).toContainEqual({ phrase: "287 story posts", sources: [hn.submitted_url] });
  });

  it("links a top-post title to that post on HN", () => {
    const c = hnCitationsForReason("Top Hacker News post 'Nothing Changes Until You Do' received 109 points.", hn);
    expect(c).toContainEqual({ phrase: "Nothing Changes Until You Do", sources: ["https://news.ycombinator.com/item?id=222"] });
  });

  it("links @handle to the profile", () => {
    const c = hnCitationsForReason("Identified Hacker News account @drodio.", hn);
    expect(c).toContainEqual({ phrase: "@drodio", sources: [hn.profile_url] });
  });

  it("adds nothing when the reason has no HN phrases", () => {
    expect(hnCitationsForReason("Y Combinator W09 alum.", hn)).toEqual([]);
  });
});
