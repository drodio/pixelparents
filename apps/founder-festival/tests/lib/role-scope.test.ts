import { describe, it, expect } from "vitest";
import { clampScope, effectiveScope } from "@/lib/role-scope";

describe("clampScope", () => {
  it("passes through the two valid values", () => {
    expect(clampScope("all")).toBe("all");
    expect(clampScope("theirs")).toBe("theirs");
  });

  it("defaults anything else to 'all' (fail-open to broad is wrong for access —\n     but the column default is 'all' and unknown stored values mean 'unconfigured')", () => {
    expect(clampScope("")).toBe("all");
    expect(clampScope("edit_all")).toBe("all");
    expect(clampScope(null)).toBe("all");
    expect(clampScope(undefined)).toBe("all");
    expect(clampScope(42)).toBe("all");
  });
});

describe("effectiveScope", () => {
  it("privileged viewers (super/env admin) always get 'all'", () => {
    expect(effectiveScope({ privileged: true, roleScope: "theirs" })).toBe("all");
    expect(effectiveScope({ privileged: true, roleScope: null })).toBe("all");
  });

  it("a null role scope (role-less) is 'all'", () => {
    expect(effectiveScope({ privileged: false, roleScope: null })).toBe("all");
  });

  it("a role's scope is used (clamped) when not privileged", () => {
    expect(effectiveScope({ privileged: false, roleScope: "theirs" })).toBe("theirs");
    expect(effectiveScope({ privileged: false, roleScope: "all" })).toBe("all");
    expect(effectiveScope({ privileged: false, roleScope: "garbage" })).toBe("all");
  });
});
