import { describe, expect, it } from "vitest";
import { builderStatusOf } from "@/lib/builder";

describe("builderStatusOf (effective builder projection from extra)", () => {
  it("is not a builder for empty / missing extra", () => {
    expect(builderStatusOf(undefined)).toEqual({ isBuilder: false, contributions: 0 });
    expect(builderStatusOf(null)).toEqual({ isBuilder: false, contributions: 0 });
    expect(builderStatusOf({})).toEqual({ isBuilder: false, contributions: 0 });
  });

  it("auto builder=true makes it a builder", () => {
    expect(builderStatusOf({ builder: true }).isBuilder).toBe(true);
  });

  it("manual override builderManual=true makes it a builder", () => {
    expect(builderStatusOf({ builderManual: true }).isBuilder).toBe(true);
  });

  it("effective = manual OR auto (either alone is enough)", () => {
    expect(builderStatusOf({ builder: true, builderManual: false }).isBuilder).toBe(true);
    expect(builderStatusOf({ builder: false, builderManual: true }).isBuilder).toBe(true);
    expect(builderStatusOf({ builder: false, builderManual: false }).isBuilder).toBe(false);
  });

  it("only the literal true counts (truthy strings/1 do not)", () => {
    expect(builderStatusOf({ builder: "true" }).isBuilder).toBe(false);
    expect(builderStatusOf({ builderManual: 1 }).isBuilder).toBe(false);
  });

  it("returns the stored contribution count", () => {
    expect(builderStatusOf({ builder: true, githubContributions: 7 }).contributions).toBe(7);
  });

  it("floors / clamps a non-integer or negative count to a safe integer", () => {
    expect(builderStatusOf({ githubContributions: 3.9 }).contributions).toBe(3);
    expect(builderStatusOf({ githubContributions: -5 }).contributions).toBe(0);
  });

  it("coerces a non-numeric count to 0", () => {
    expect(builderStatusOf({ githubContributions: "12" }).contributions).toBe(0);
    expect(builderStatusOf({ githubContributions: null }).contributions).toBe(0);
  });
});
