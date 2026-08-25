import { describe, it, expect } from "vitest";
import { buildOnboardingSteps, clampForward, stepIndexFor } from "./onboarding-steps";

// The step ORDER is the product spec (V2 doc): verification first, then the
// role step, then sharing, then the invite. These tests pin it.

describe("buildOnboardingSteps", () => {
  it("orders a parent: verify, OWN info pages, sharing, then Add-your-student LAST", () => {
    // Round 3: parents never fill out children mid-flow — the optional student
    // invite sits at the END, after the parent has fully onboarded themselves.
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: true,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).toEqual([
      "verify",
      "city",
      "socials",
      "interests",
      "photos",
      "share",
      "students",
      "invite",
    ]);
  });

  it("ends a self-signup student on parent-link, with no refer-a-family step (round 5)", () => {
    const keys = buildOnboardingSteps({
      isStudent: true,
      hasReferral: true,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).toEqual([
      "verify",
      "city",
      "socials",
      "interests",
      "photos",
      "share",
      "parent-link",
    ]);
  });

  it("drops parent-link for an INVITED student and never offers students/invite to students", () => {
    const keys = buildOnboardingSteps({
      isStudent: true,
      hasReferral: true,
      hasVerify: true,
      alreadyLinked: true,
    }).map((s) => s.key);
    expect(keys).toEqual(["verify", "city", "socials", "interests", "photos", "share"]);
  });

  it("keeps every self-info page BEFORE the sharing step (fill first, share second)", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: true,
      hasVerify: true,
    }).map((s) => s.key);
    const shareAt = keys.indexOf("share");
    for (const k of ["city", "socials", "interests", "photos"] as const) {
      expect(keys.indexOf(k)).toBeLessThan(shareAt);
    }
  });

  it("keeps the verify step blurb EMPTY for both roles (Aug 18: title + cards only)", () => {
    const parent = buildOnboardingSteps({ isStudent: false, hasReferral: true, hasVerify: true });
    const student = buildOnboardingSteps({ isStudent: true, hasReferral: true, hasVerify: true });
    expect(parent[0]!.blurb).toBe("");
    expect(student[0]!.blurb).toBe("");
  });

  it("drops the invite step when there is no referral link", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: false,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).not.toContain("invite");
    expect(keys[0]).toBe("verify");
  });

  it("drops the verify step when no verify state is available", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: true,
      hasVerify: false,
    }).map((s) => s.key);
    expect(keys).not.toContain("verify");
    expect(keys[0]).toBe("city");
  });

  it("verification is NOT skippable; every other step is (V2 round 2)", () => {
    for (const role of [true, false]) {
      for (const s of buildOnboardingSteps({ isStudent: role, hasReferral: true, hasVerify: true })) {
        expect(s.skippable).toBe(s.key !== "verify");
      }
    }
  });
});

describe("clampForward", () => {
  const steps = buildOnboardingSteps({ isStudent: false, hasReferral: true, hasVerify: true });
  const last = steps.length - 1;
  const shareAt = steps.findIndex((s) => s.key === "share");

  it("does not clamp when nothing is blocked", () => {
    expect(clampForward(steps, new Set(), 0, last)).toBe(last);
  });

  it("pins the member on a blocked CURRENT step", () => {
    expect(clampForward(steps, new Set(["verify"]), 0, 1)).toBe(0);
    expect(clampForward(steps, new Set(["verify"]), 0, last)).toBe(0);
  });

  it("lets a jump ENTER a blocked step ahead but never pass it", () => {
    expect(clampForward(steps, new Set(["share"]), 0, last)).toBe(shareAt);
  });

  it("does not care about blocked steps behind the member", () => {
    expect(clampForward(steps, new Set(["verify"]), 1, last)).toBe(last);
  });
});

describe("stepIndexFor", () => {
  const steps = buildOnboardingSteps({ isStudent: false, hasReferral: true, hasVerify: true });

  it("resolves a known key to its index", () => {
    expect(stepIndexFor(steps, "share")).toBe(steps.findIndex((s) => s.key === "share"));
    expect(stepIndexFor(steps, "socials")).toBe(2);
  });

  it("falls back to the first step for unknown or missing keys", () => {
    expect(stepIndexFor(steps, "nonsense")).toBe(0);
    expect(stepIndexFor(steps, null)).toBe(0);
    expect(stepIndexFor(steps, undefined)).toBe(0);
  });
});
