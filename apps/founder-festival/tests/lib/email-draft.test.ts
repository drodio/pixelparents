import { describe, it, expect } from "vitest";
import {
  draftStorageKey,
  isDraftEmpty,
  serializeDraft,
  parseDraft,
  type EmailDraft,
} from "@/lib/email-draft";

const base: EmailDraft = {
  from: "Founder Festival <hello@festival.so>",
  bcc: "",
  subject: "",
  body: "",
  signature: "DROdio",
  selected: [],
  scheduleMode: "now",
  scheduleAt: "",
};

describe("draftStorageKey", () => {
  it("namespaces per event", () => {
    expect(draftStorageKey("evt_1")).toBe("ff:email-draft:evt_1");
    expect(draftStorageKey("evt_1")).not.toBe(draftStorageKey("evt_2"));
  });
});

describe("isDraftEmpty", () => {
  it("a fresh composer (only From + signature) is empty", () => {
    expect(isDraftEmpty(base)).toBe(true);
  });
  it("whitespace-only subject/body/bcc still counts as empty", () => {
    expect(isDraftEmpty({ ...base, subject: "  ", body: "\n", bcc: "  " })).toBe(true);
  });
  it("any real composition makes it non-empty", () => {
    expect(isDraftEmpty({ ...base, subject: "Hi" })).toBe(false);
    expect(isDraftEmpty({ ...base, body: "Hello" })).toBe(false);
    expect(isDraftEmpty({ ...base, bcc: "ops@festival.so" })).toBe(false);
    expect(isDraftEmpty({ ...base, selected: ["a@x.com"] })).toBe(false);
    expect(isDraftEmpty({ ...base, scheduleMode: "on", scheduleAt: "2026-07-01T10:00" })).toBe(false);
  });
});

describe("serialize / parse round-trip", () => {
  it("round-trips a full draft", () => {
    const d: EmailDraft = {
      ...base,
      subject: "You're invited",
      body: "Hi {{nickname}}",
      bcc: "ops@festival.so",
      selected: ["a@x.com", "b@y.com"],
      scheduleMode: "on",
      scheduleAt: "2026-07-01T10:00",
    };
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });
});

describe("parseDraft defensiveness", () => {
  it("returns null for empty/garbage/non-object", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft("123")).toBeNull();
    expect(parseDraft("{}")).toBeNull();
  });
  it("keeps only well-typed fields and drops the rest", () => {
    const out = parseDraft(
      JSON.stringify({ subject: "Hi", body: 42, selected: ["a@x.com", 7, null], scheduleMode: "bogus", extra: "x" }),
    );
    expect(out).toEqual({ subject: "Hi", selected: ["a@x.com"] });
  });
});
