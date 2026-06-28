import { describe, expect, it } from "vitest";
import { rankChatNodes } from "@/lib/event-chat-shared";

type N = { score: number; createdAt: string };

const sorted = (nodes: N[]) => [...nodes].sort(rankChatNodes);

describe("rankChatNodes", () => {
  it("puts upvoted comments above non-upvoted, regardless of date", () => {
    const older = { score: 5, createdAt: "2026-01-01T00:00:00.000Z" };
    const newer = { score: 0, createdAt: "2026-06-01T00:00:00.000Z" };
    expect(sorted([newer, older])).toEqual([older, newer]);
  });

  it("within the same score, newest comes first", () => {
    const a = { score: 0, createdAt: "2026-01-01T00:00:00.000Z" };
    const b = { score: 0, createdAt: "2026-03-01T00:00:00.000Z" };
    const c = { score: 0, createdAt: "2026-06-01T00:00:00.000Z" };
    expect(sorted([a, c, b])).toEqual([c, b, a]);
  });

  it("ranks by score desc first, then newest within a tie", () => {
    const hiOld = { score: 9, createdAt: "2026-01-01T00:00:00.000Z" };
    const hiNew = { score: 9, createdAt: "2026-05-01T00:00:00.000Z" };
    const loNew = { score: 1, createdAt: "2026-06-01T00:00:00.000Z" };
    expect(sorted([hiOld, loNew, hiNew])).toEqual([hiNew, hiOld, loNew]);
  });
});
