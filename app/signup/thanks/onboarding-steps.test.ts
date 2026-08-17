import { describe, it, expect } from "vitest";
import { buildOnboardingSteps, clampForward, stepIndexFor } from "./onboarding-steps";

// The step ORDER is the product spec (V2 doc): verification first, then the
// role step, then sharing, then the invite. These tests pin it.

describe("buildOnboardingSteps", () => {
  it("puts verification FIRST for a parent, then children, sharing, invite", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: true,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).toEqual(["verify", "children", "share", "invite"]);
  });

  it("gives a student the parent-link step instead of children", () => {
    const keys = buildOnboardingSteps({
      isStudent: true,
      hasReferral: true,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).toEqual(["verify", "parent-link", "share", "invite"]);
  });

  it("words the verify step for the role", () => {
    const parent = buildOnboardingSteps({ isStudent: false, hasReferral: true, hasVerify: true });
    const student = buildOnboardingSteps({ isStudent: true, hasReferral: true, hasVerify: true });
    expect(parent[0]!.blurb).toContain("your child's OHS student email");
    expect(student[0]!.blurb).toContain("your OHS student email");
  });

  it("drops the invite step when there is no referral link", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: false,
      hasVerify: true,
    }).map((s) => s.key);
    expect(keys).toEqual(["verify", "children", "share"]);
  });

  it("drops the verify step when no verify state is available", () => {
    const keys = buildOnboardingSteps({
      isStudent: false,
      hasReferral: true,
      hasVerify: false,
    }).map((s) => s.key);
    expect(keys).toEqual(["children", "share", "invite"]);
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
  // steps: verify(0) children(1) share(2) invite(3)

  it("does not clamp when nothing is blocked", () => {
    expect(clampForward(steps, new Set(), 0, 3)).toBe(3);
  });

  it("pins the member on a blocked CURRENT step", () => {
    expect(clampForward(steps, new Set(["verify"]), 0, 1)).toBe(0);
    expect(clampForward(steps, new Set(["verify"]), 0, 3)).toBe(0);
  });

  it("lets a jump ENTER a blocked step ahead but never pass it", () => {
    expect(clampForward(steps, new Set(["share"]), 0, 3)).toBe(2);
  });

  it("does not care about blocked steps behind the member", () => {
    expect(clampForward(steps, new Set(["verify"]), 1, 3)).toBe(3);
  });
});

describe("stepIndexFor", () => {
  const steps = buildOnboardingSteps({ isStudent: false, hasReferral: true, hasVerify: true });

  it("resolves a known key to its index", () => {
    expect(stepIndexFor(steps, "share")).toBe(2);
  });

  it("falls back to the first step for unknown or missing keys", () => {
    expect(stepIndexFor(steps, "nonsense")).toBe(0);
    expect(stepIndexFor(steps, null)).toBe(0);
    expect(stepIndexFor(steps, undefined)).toBe(0);
  });
});
