import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { events } from "@/db/schema";
import { IS_PROD_DB } from "../setup";
import { eventSlugBase, uniqueEventSlug } from "@/lib/luma-sync";

const rnd = () => Math.random().toString(36).slice(2, 8);

describe("eventSlugBase", () => {
  it("prefers the slugified title over the lu.ma URL slug", () => {
    expect(
      eventSlugBase({ name: "Summer Founder Dinner", url: "https://luma.com/id5j1bw0", api_id: "evt-abc" }),
    ).toBe("summer-founder-dinner");
  });

  it("falls back to the lu.ma URL slug when the title slugifies to empty", () => {
    expect(eventSlugBase({ name: "🎉", url: "https://luma.com/cool-party", api_id: "evt-abc" })).toBe("cool-party");
  });

  it("falls back to luma-<id> when there's neither a title nor a url slug", () => {
    expect(eventSlugBase({ name: "🎉", url: null, api_id: "evt-XyZ" })).toBe("luma-xyz");
  });
});

describe.skipIf(IS_PROD_DB)("uniqueEventSlug", () => {
  it("appends -2 when the base slug is already taken by another event", async () => {
    const base = "dinner-" + rnd();
    await db.insert(events).values({
      slug: base,
      title: "Dinner",
      startsAt: new Date("2026-06-01"),
      status: "open",
      criteria: {},
      source: "luma",
    });
    expect(await uniqueEventSlug(base)).toBe(`${base}-2`);
  });

  it("returns the base untouched when it's free", async () => {
    const base = "free-" + rnd();
    expect(await uniqueEventSlug(base)).toBe(base);
  });
});
