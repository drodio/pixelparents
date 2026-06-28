import { describe, it, expect } from "vitest";
import { founderRows, investorRows } from "@/lib/breakdown-rows";

const fr = { points: 10, reason: "Founder thing" };
const ir = { points: 7, reason: "Investor thing" };

describe("founderRows / investorRows", () => {
  it("reads the new { founder, investor } object shape", () => {
    const b = { founder: [fr], investor: [ir] };
    expect(founderRows(b)).toEqual([fr]);
    expect(investorRows(b)).toEqual([ir]);
  });

  it("treats a legacy flat array as FOUNDER rows, investor empty", () => {
    const legacy = [fr, { points: 3, reason: "another" }];
    expect(founderRows(legacy)).toEqual(legacy);
    expect(investorRows(legacy)).toEqual([]); // the divergence bug: must NOT drop into founder
  });

  it("returns [] for null / undefined", () => {
    expect(founderRows(null)).toEqual([]);
    expect(investorRows(undefined)).toEqual([]);
  });

  it("returns [] for a missing or non-array dimension key", () => {
    expect(investorRows({ founder: [fr] })).toEqual([]); // investor key absent
    expect(founderRows({ founder: "nope" })).toEqual([]); // non-array value
  });
});
