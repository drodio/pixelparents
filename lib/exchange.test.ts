import { describe, expect, it } from "vitest";
import {
  distinctTags,
  filterAndSortPosts,
  isExpired,
  isExpiringSoon,
  type ExchangeFilters,
  type ExchangePost,
} from "@/lib/exchange";

const NOW = Date.parse("2026-06-30T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function post(overrides: Partial<ExchangePost> = {}): ExchangePost {
  return {
    id: "p1",
    kind: "ask",
    title: "Title",
    body: "Body",
    tags: [],
    urgency: "normal",
    status: "open",
    createdAt: new Date(NOW).toISOString(),
    validUntil: null,
    authorName: "Member",
    isStudent: false,
    ...overrides,
  };
}

function filters(overrides: Partial<ExchangeFilters> = {}): ExchangeFilters {
  return {
    kind: "all",
    status: "open",
    tags: new Set(),
    sortKey: "recency",
    sortDir: "asc",
    showExpired: false,
    mineSignupId: null,
    myPostIds: null,
    ...overrides,
  };
}

describe("isExpired / isExpiringSoon", () => {
  it("null validUntil never expires", () => {
    expect(isExpired(post({ validUntil: null }), NOW)).toBe(false);
    expect(isExpiringSoon(post({ validUntil: null }), NOW)).toBe(false);
  });
  it("a past date is expired", () => {
    expect(isExpired(post({ validUntil: new Date(NOW - DAY).toISOString() }), NOW)).toBe(true);
  });
  it("a near-future date is expiring soon but not expired", () => {
    const p = post({ validUntil: new Date(NOW + DAY).toISOString() });
    expect(isExpired(p, NOW)).toBe(false);
    expect(isExpiringSoon(p, NOW)).toBe(true);
  });
  it("a far-future date is neither", () => {
    const p = post({ validUntil: new Date(NOW + 30 * DAY).toISOString() });
    expect(isExpired(p, NOW)).toBe(false);
    expect(isExpiringSoon(p, NOW)).toBe(false);
  });
});

describe("filterAndSortPosts — default sort (oldest open first)", () => {
  it("orders open posts oldest-first by default", () => {
    const posts = [
      post({ id: "new", createdAt: new Date(NOW).toISOString() }),
      post({ id: "old", createdAt: new Date(NOW - 5 * DAY).toISOString() }),
      post({ id: "mid", createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    ];
    const out = filterAndSortPosts(posts, filters(), NOW);
    expect(out.map((p) => p.id)).toEqual(["old", "mid", "new"]);
  });

  it("recency toggle flips to newest-first", () => {
    const posts = [
      post({ id: "old", createdAt: new Date(NOW - 5 * DAY).toISOString() }),
      post({ id: "new", createdAt: new Date(NOW).toISOString() }),
    ];
    const out = filterAndSortPosts(posts, filters({ sortDir: "desc" }), NOW);
    expect(out.map((p) => p.id)).toEqual(["new", "old"]);
  });
});

describe("filterAndSortPosts — kind split", () => {
  it("filters to asks only", () => {
    const posts = [post({ id: "a", kind: "ask" }), post({ id: "o", kind: "offer" })];
    expect(filterAndSortPosts(posts, filters({ kind: "ask" }), NOW).map((p) => p.id)).toEqual(["a"]);
  });
  it("filters to offers only", () => {
    const posts = [post({ id: "a", kind: "ask" }), post({ id: "o", kind: "offer" })];
    expect(filterAndSortPosts(posts, filters({ kind: "offer" }), NOW).map((p) => p.id)).toEqual(["o"]);
  });
  it("'all' keeps both", () => {
    const posts = [post({ id: "a", kind: "ask" }), post({ id: "o", kind: "offer" })];
    expect(filterAndSortPosts(posts, filters({ kind: "all" }), NOW)).toHaveLength(2);
  });
});

describe("filterAndSortPosts — urgency sort toggles", () => {
  const posts = [
    post({ id: "lo", urgency: "low", createdAt: new Date(NOW - DAY).toISOString() }),
    post({ id: "hi", urgency: "high", createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    post({ id: "no", urgency: "normal", createdAt: new Date(NOW - 3 * DAY).toISOString() }),
  ];
  it("urgency desc → high first", () => {
    const out = filterAndSortPosts(posts, filters({ sortKey: "urgency", sortDir: "desc" }), NOW);
    expect(out.map((p) => p.id)).toEqual(["hi", "no", "lo"]);
  });
  it("urgency asc → low first", () => {
    const out = filterAndSortPosts(posts, filters({ sortKey: "urgency", sortDir: "asc" }), NOW);
    expect(out.map((p) => p.id)).toEqual(["lo", "no", "hi"]);
  });
  it("ties within a tier break by oldest-first", () => {
    const tied = [
      post({ id: "y", urgency: "high", createdAt: new Date(NOW).toISOString() }),
      post({ id: "x", urgency: "high", createdAt: new Date(NOW - DAY).toISOString() }),
    ];
    const out = filterAndSortPosts(tied, filters({ sortKey: "urgency", sortDir: "desc" }), NOW);
    expect(out.map((p) => p.id)).toEqual(["x", "y"]);
  });
});

describe("filterAndSortPosts — status + expiry handling", () => {
  it("default open status hides resolved posts", () => {
    const posts = [post({ id: "open", status: "open" }), post({ id: "done", status: "resolved" })];
    expect(filterAndSortPosts(posts, filters(), NOW).map((p) => p.id)).toEqual(["open"]);
  });
  it("status=resolved shows only resolved", () => {
    const posts = [post({ id: "open", status: "open" }), post({ id: "done", status: "resolved" })];
    expect(filterAndSortPosts(posts, filters({ status: "resolved" }), NOW).map((p) => p.id)).toEqual([
      "done",
    ]);
  });
  it("hides expired posts by default but shows them when showExpired", () => {
    const posts = [
      post({ id: "live", validUntil: new Date(NOW + DAY).toISOString() }),
      post({ id: "dead", validUntil: new Date(NOW - DAY).toISOString() }),
    ];
    expect(filterAndSortPosts(posts, filters(), NOW).map((p) => p.id)).toEqual(["live"]);
    expect(
      filterAndSortPosts(posts, filters({ showExpired: true }), NOW).map((p) => p.id).sort(),
    ).toEqual(["dead", "live"]);
  });
});

describe("filterAndSortPosts — tag + my-posts facets", () => {
  it("OR-matches selected tags case-insensitively", () => {
    const posts = [
      post({ id: "ai", tags: ["AI", "chess"] }),
      post({ id: "cook", tags: ["Cooking"] }),
    ];
    const out = filterAndSortPosts(posts, filters({ tags: new Set(["ai"]) }), NOW);
    expect(out.map((p) => p.id)).toEqual(["ai"]);
  });
  it("'my posts' restricts to the provided id set", () => {
    const posts = [post({ id: "mine" }), post({ id: "theirs" })];
    const out = filterAndSortPosts(
      posts,
      filters({ mineSignupId: "me", myPostIds: new Set(["mine"]) }),
      NOW,
    );
    expect(out.map((p) => p.id)).toEqual(["mine"]);
  });
  it("'my posts' with an EMPTY id set yields zero posts (not the whole board)", () => {
    // Regression: a viewer who has posted nothing toggling "My posts" must see an
    // empty result, not every post as if the toggle did nothing.
    const posts = [post({ id: "a" }), post({ id: "b" })];
    const out = filterAndSortPosts(
      posts,
      filters({ mineSignupId: "me", myPostIds: new Set<string>() }),
      NOW,
    );
    expect(out).toEqual([]);
  });
});

describe("distinctTags", () => {
  it("dedups case-insensitively, keeps first label, sorts", () => {
    const posts = [post({ tags: ["Chess", "AI"] }), post({ tags: ["ai", "Robotics"] })];
    expect(distinctTags(posts)).toEqual(["AI", "Chess", "Robotics"]);
  });
});
