import { describe, expect, it } from "vitest";
import { rewriteMentionNames, mentionsToText } from "@/lib/event-chat-shared";

const ID = "7b03e43b-5e4d-482b-9b89-4d49fe3bfe23";
const OTHER = "11111111-2222-3333-4444-555555555555";

describe("rewriteMentionNames", () => {
  it("swaps the baked-in name for the current preferred name", () => {
    const body = `Hello world, @[Daniel R. Odio](${ID})`;
    const out = rewriteMentionNames(body, new Map([[ID, "DROdio"]]));
    expect(out).toBe(`Hello world, @[DROdio](${ID})`);
  });

  it("matches evalId case-insensitively", () => {
    const body = `@[Daniel R. Odio](${ID.toUpperCase()}) hello`;
    const out = rewriteMentionNames(body, new Map([[ID, "DROdio"]]));
    expect(out).toBe(`@[DROdio](${ID.toUpperCase()}) hello`);
  });

  it("leaves markers whose evalId isn't in the map untouched", () => {
    const body = `@[Theo Vance](${OTHER}) and @[Daniel R. Odio](${ID})`;
    const out = rewriteMentionNames(body, new Map([[ID, "DROdio"]]));
    expect(out).toBe(`@[Theo Vance](${OTHER}) and @[DROdio](${ID})`);
  });

  it("is a no-op for an empty map or no markers", () => {
    expect(rewriteMentionNames("plain text", new Map())).toBe("plain text");
    expect(rewriteMentionNames("no markers here", new Map([[ID, "DROdio"]]))).toBe("no markers here");
  });

  it("feeds clean plain text to display after rewrite", () => {
    const body = `@[Daniel R. Odio](${ID}) hello world`;
    const rewritten = rewriteMentionNames(body, new Map([[ID, "DROdio"]]));
    expect(mentionsToText(rewritten)).toBe("@DROdio hello world");
  });
});
