import { describe, expect, it } from "vitest";
import {
  isMentionId,
  mentionTargets,
  normalizeMentions,
  mentionPlainText,
  serializeMention,
} from "@/lib/mentions";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SELF = "33333333-3333-4333-8333-333333333333";

describe("isMentionId", () => {
  it("accepts a uuid", () => {
    expect(isMentionId(A)).toBe(true);
  });
  it("rejects non-uuid ids (e.g. a child-caption id)", () => {
    expect(isMentionId("c1")).toBe(false);
    expect(isMentionId("")).toBe(false);
    expect(isMentionId("not-a-uuid")).toBe(false);
  });
});

describe("mentionTargets", () => {
  it("returns distinct, well-formed ids and drops self", () => {
    const body = `Hi ${serializeMention("Jane", A)} and ${serializeMention("Bob", B)} and ${serializeMention("Me", SELF)}`;
    expect(mentionTargets(body, SELF)).toEqual([A, B]);
  });

  it("dedupes a repeated mention", () => {
    const body = `${serializeMention("Jane", A)} ... ${serializeMention("Jane", A)}`;
    expect(mentionTargets(body)).toEqual([A]);
  });

  it("ignores markers with a non-uuid id", () => {
    const body = `${serializeMention("Kid", "c1")} ${serializeMention("Jane", A)}`;
    expect(mentionTargets(body)).toEqual([A]);
  });

  it("returns [] for a plain body", () => {
    expect(mentionTargets("just text, no mentions")).toEqual([]);
  });
});

describe("normalizeMentions", () => {
  it("rewrites an authorized mention to the authoritative name", () => {
    const body = `Thanks ${serializeMention("J", A)}!`;
    const out = normalizeMentions(body, new Map([[A, "Jane Doe"]]));
    expect(out).toBe(`Thanks ${serializeMention("Jane Doe", A)}!`);
  });

  it("collapses an UNauthorized id to plain @Name (no link forged)", () => {
    const body = `Hi ${serializeMention("Ghost", B)}`;
    const out = normalizeMentions(body, new Map()); // B not authorized
    expect(out).toBe("Hi @Ghost");
  });

  it("collapses a non-uuid id even if present in the map", () => {
    const body = `${serializeMention("Kid", "c1")}`;
    const out = normalizeMentions(body, new Map([["c1", "Kid"]]));
    expect(out).toBe("@Kid");
  });

  it("leaves plain text untouched", () => {
    expect(normalizeMentions("no mentions here", new Map())).toBe("no mentions here");
  });

  it("handles a mix of authorized and unauthorized in one body", () => {
    const body = `${serializeMention("A", A)} & ${serializeMention("B", B)}`;
    const out = normalizeMentions(body, new Map([[A, "Alice"]]));
    expect(out).toBe(`${serializeMention("Alice", A)} & @B`);
  });
});

describe("mentionPlainText", () => {
  it("flattens markers to @Name", () => {
    const body = `Hi ${serializeMention("Jane Doe", A)}, welcome`;
    expect(mentionPlainText(body)).toBe("Hi @Jane Doe, welcome");
  });
  it("passes plain text through", () => {
    expect(mentionPlainText("plain")).toBe("plain");
  });
});
