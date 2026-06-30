import { describe, it, expect } from "vitest";
import { consentCovers } from "./consent";

// Remembered consent skips the consent screen only when the stored grant is a
// SUPERSET of what's now requested; any newly-requested scope re-prompts.
describe("consentCovers", () => {
  it("covers an equal or narrower request", () => {
    expect(consentCovers("openid email ohs_verified", ["openid", "email"])).toBe(true);
    expect(consentCovers("openid email ohs_verified", ["openid", "email", "ohs_verified"])).toBe(true);
  });

  it("does NOT cover a request that adds a new scope (re-prompt for new disclosure)", () => {
    expect(consentCovers("openid email", ["openid", "email", "grade_band"])).toBe(false);
  });

  it("no prior consent never covers anything", () => {
    expect(consentCovers(null, ["openid"])).toBe(false);
    expect(consentCovers("", ["openid"])).toBe(false);
  });

  it("ignores unknown stored scopes (parsed via the supported set)", () => {
    expect(consentCovers("openid email bogus", ["openid", "email"])).toBe(true);
  });
});
