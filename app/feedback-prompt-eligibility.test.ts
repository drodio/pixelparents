import { describe, it, expect } from "vitest";
import {
  decideFeedbackPrompt,
  FEEDBACK_PROMPT_COOLDOWN_MS,
  type FeedbackPromptEnv,
} from "@/components/feedback-prompt";

// Pure-logic coverage for the ambient feedback prompt's show/hide cadence.
// Mirrors install-eligibility.test.ts — the React component + storage plumbing
// are out of scope for the node-only unit suite; the eligibility decision is the
// gate that keeps the prompt from nagging, so it's worth pinning here.

const NOW = 1_700_000_000_000; // fixed "now" for deterministic cadence math.

function base(overrides: Partial<FeedbackPromptEnv> = {}): FeedbackPromptEnv {
  return {
    now: NOW,
    lastSeenAt: null,
    shownThisSession: false,
    ...overrides,
  };
}

describe("decideFeedbackPrompt", () => {
  it("shows the first time ever (never seen, fresh session)", () => {
    expect(decideFeedbackPrompt(base())).toBe(true);
  });

  it("hides when already shown this browser session", () => {
    expect(decideFeedbackPrompt(base({ shownThisSession: true }))).toBe(false);
  });

  it("hides right after a dismissal (within the cooldown window)", () => {
    expect(
      decideFeedbackPrompt(base({ lastSeenAt: NOW - 1000 })),
    ).toBe(false);
  });

  it("hides one hour before the cooldown fully elapses", () => {
    const lastSeenAt = NOW - (FEEDBACK_PROMPT_COOLDOWN_MS - 60 * 60 * 1000);
    expect(decideFeedbackPrompt(base({ lastSeenAt }))).toBe(false);
  });

  it("shows again exactly at the cooldown boundary", () => {
    const lastSeenAt = NOW - FEEDBACK_PROMPT_COOLDOWN_MS;
    expect(decideFeedbackPrompt(base({ lastSeenAt }))).toBe(true);
  });

  it("shows again well after the cooldown has elapsed", () => {
    const lastSeenAt = NOW - 2 * FEEDBACK_PROMPT_COOLDOWN_MS;
    expect(decideFeedbackPrompt(base({ lastSeenAt }))).toBe(true);
  });

  it("session guard wins even when the cooldown has elapsed", () => {
    const lastSeenAt = NOW - 2 * FEEDBACK_PROMPT_COOLDOWN_MS;
    expect(
      decideFeedbackPrompt(base({ lastSeenAt, shownThisSession: true })),
    ).toBe(false);
  });

  it("treats a future lastSeenAt (clock skew / tampering) as recently seen", () => {
    expect(
      decideFeedbackPrompt(base({ lastSeenAt: NOW + FEEDBACK_PROMPT_COOLDOWN_MS })),
    ).toBe(false);
  });
});
