import { describe, expect, it } from "vitest";
import {
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_MESSAGE,
  isFeedbackStatus,
  sanitizeFeedbackMessage,
} from "@/lib/db/feedback";

// Pure-logic coverage for the feedback data layer. The DB-touching functions
// (createFeedback/listFeedback/setFeedbackStatus/countOpenFeedback) need a live
// Neon connection and are out of scope for the node-only unit suite; the status
// guard and the message sanitizer are the validation gates the submit action +
// admin status action rely on, so they're worth pinning here.

describe("isFeedbackStatus", () => {
  it("accepts the canonical statuses", () => {
    expect(isFeedbackStatus("new")).toBe(true);
    expect(isFeedbackStatus("reviewed")).toBe(true);
    expect(isFeedbackStatus("resolved")).toBe(true);
  });

  it("rejects anything else, including casing, junk, and non-strings", () => {
    expect(isFeedbackStatus("New")).toBe(false);
    expect(isFeedbackStatus("RESOLVED")).toBe(false);
    expect(isFeedbackStatus("open")).toBe(false);
    expect(isFeedbackStatus("")).toBe(false);
    expect(isFeedbackStatus("'; drop table feedback;--")).toBe(false);
    expect(isFeedbackStatus(null)).toBe(false);
    expect(isFeedbackStatus(undefined)).toBe(false);
    expect(isFeedbackStatus(3)).toBe(false);
  });

  it("narrows exactly to the exported status set", () => {
    for (const s of FEEDBACK_STATUSES) {
      expect(isFeedbackStatus(s)).toBe(true);
    }
    expect(FEEDBACK_STATUSES).toEqual(["new", "reviewed", "resolved"]);
  });
});

describe("sanitizeFeedbackMessage", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeFeedbackMessage("  hello  ")).toBe("hello");
    expect(sanitizeFeedbackMessage("\n\thi\n")).toBe("hi");
  });

  it("returns empty string for blank / whitespace-only input", () => {
    expect(sanitizeFeedbackMessage("")).toBe("");
    expect(sanitizeFeedbackMessage("   ")).toBe("");
    expect(sanitizeFeedbackMessage("\n\n")).toBe("");
  });

  it("preserves internal line breaks", () => {
    expect(sanitizeFeedbackMessage("line 1\nline 2")).toBe("line 1\nline 2");
  });

  it("hard-caps the message at MAX_FEEDBACK_MESSAGE characters", () => {
    const long = "a".repeat(MAX_FEEDBACK_MESSAGE + 500);
    const out = sanitizeFeedbackMessage(long);
    expect(out.length).toBe(MAX_FEEDBACK_MESSAGE);
  });

  it("caps AFTER trimming, so leading whitespace doesn't eat into the limit", () => {
    const out = sanitizeFeedbackMessage("   " + "b".repeat(MAX_FEEDBACK_MESSAGE));
    expect(out.length).toBe(MAX_FEEDBACK_MESSAGE);
    expect(out[0]).toBe("b");
  });

  it("tolerates a nullish argument without throwing", () => {
    // @ts-expect-error — exercising the runtime guard against a nullish caller.
    expect(sanitizeFeedbackMessage(undefined)).toBe("");
    // @ts-expect-error — same, for null.
    expect(sanitizeFeedbackMessage(null)).toBe("");
  });
});
