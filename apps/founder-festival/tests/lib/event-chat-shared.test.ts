import { describe, it, expect } from "vitest";
import {
  canViewChat,
  canPostChat,
  parseMentionedIds,
  renderMentions,
  mentionsToText,
  isChatVisibility,
  chatLengthError,
  CHAT_TITLE_MAX,
  CHAT_BODY_MAX,
} from "@/lib/event-chat-shared";

const ID1 = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";

describe("chatLengthError", () => {
  it("passes normal title + body", () => {
    expect(chatLengthError({ title: "Hello", body: "Some thoughts." })).toBeNull();
  });
  it("passes a body-only reply (no title)", () => {
    expect(chatLengthError({ body: "a reply" })).toBeNull();
  });
  it("rejects an over-long title", () => {
    expect(chatLengthError({ title: "x".repeat(CHAT_TITLE_MAX + 1), body: "ok" })).toMatch(/title/i);
  });
  it("rejects an over-long body", () => {
    expect(chatLengthError({ title: "ok", body: "x".repeat(CHAT_BODY_MAX + 1) })).toMatch(/body/i);
  });
  it("accepts exactly the max lengths", () => {
    expect(chatLengthError({ title: "x".repeat(CHAT_TITLE_MAX), body: "x".repeat(CHAT_BODY_MAX) })).toBeNull();
  });
});

describe("canViewChat", () => {
  const cases: Array<[Parameters<typeof canViewChat>[0], boolean, boolean, boolean]> = [
    // visibility, isMember, isAttendee, expected
    ["public", false, false, true],
    ["public", true, false, true],
    ["members", false, false, false],
    ["members", true, false, true],
    ["attendees", true, false, false],
    ["attendees", true, true, true],
    ["attendees", false, true, true],
  ];
  it.each(cases)("%s member=%s attendee=%s → %s", (v, isMember, isAttendee, expected) => {
    expect(canViewChat(v, { isMember, isAttendee })).toBe(expected);
  });
});

describe("canPostChat", () => {
  it("requires a claimed member for everything", () => {
    expect(canPostChat("public", { isMember: false, isAttendee: true })).toBe(false);
    expect(canPostChat("members", { isMember: false, isAttendee: false })).toBe(false);
  });
  it("members can post public/members", () => {
    expect(canPostChat("public", { isMember: true, isAttendee: false })).toBe(true);
    expect(canPostChat("members", { isMember: true, isAttendee: false })).toBe(true);
  });
  it("attendees-only requires attending", () => {
    expect(canPostChat("attendees", { isMember: true, isAttendee: false })).toBe(false);
    expect(canPostChat("attendees", { isMember: true, isAttendee: true })).toBe(true);
  });
});

describe("parseMentionedIds", () => {
  it("extracts + dedups + lowercases, ignores non-uuid markers", () => {
    const body = `hey @[Theo Vance](${ID1}) and @[Jane](${ID2}) and again @[Theo](${ID1.toUpperCase()}) plus @[Nope](not-a-uuid)`;
    expect(parseMentionedIds(body)).toEqual([ID1, ID2]);
  });
  it("returns [] when no mentions", () => {
    expect(parseMentionedIds("plain text")).toEqual([]);
  });
});

describe("renderMentions", () => {
  it("splits text and mention segments", () => {
    const segs = renderMentions(`hi @[Theo Vance](${ID1})!`);
    expect(segs).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", text: "@Theo Vance", evalId: ID1 },
      { kind: "text", text: "!" },
    ]);
  });
  it("passes through plain text", () => {
    expect(renderMentions("just text")).toEqual([{ kind: "text", text: "just text" }]);
  });
});

describe("mentionsToText", () => {
  it("renders markers as readable @Name (no links) for titles", () => {
    expect(mentionsToText(`Welcome @[Theo Vance](${ID1})!`)).toBe("Welcome @Theo Vance!");
  });
  it("passes through plain titles", () => {
    expect(mentionsToText("Post-dinner plans")).toBe("Post-dinner plans");
  });
});

describe("isChatVisibility", () => {
  it("guards the enum", () => {
    expect(isChatVisibility("members")).toBe(true);
    expect(isChatVisibility("secret")).toBe(false);
    expect(isChatVisibility(null)).toBe(false);
  });
});
