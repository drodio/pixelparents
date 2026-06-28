import { describe, it, expect } from "vitest";
import {
  EXA_PRICING,
  emptyExaUsage,
  searchUsage,
  contentsUsage,
  addExaUsage,
  sumExaUsage,
} from "@/lib/exa-cost";

describe("emptyExaUsage", () => {
  it("is all zeros", () => {
    expect(emptyExaUsage()).toEqual({
      searches: 0,
      contentFetches: 0,
      costUsd: 0,
      numResultsOver10: 0,
    });
  });
});

describe("searchUsage", () => {
  it("charges the flat search rate for <=10 results", () => {
    const u = searchUsage(10);
    expect(u.searches).toBe(1);
    expect(u.contentFetches).toBe(0);
    expect(u.numResultsOver10).toBe(0);
    expect(u.costUsd).toBeCloseTo(EXA_PRICING.searchUsd, 10);
  });

  it("does not go negative for fewer than 10 results", () => {
    const u = searchUsage(6);
    expect(u.numResultsOver10).toBe(0);
    expect(u.costUsd).toBeCloseTo(EXA_PRICING.searchUsd, 10);
  });

  it("adds the per-result overage above 10 results", () => {
    const u = searchUsage(25);
    expect(u.numResultsOver10).toBe(15);
    expect(u.costUsd).toBeCloseTo(
      EXA_PRICING.searchUsd + 15 * EXA_PRICING.extraResultUsd,
      10,
    );
  });
});

describe("contentsUsage", () => {
  it("charges per page", () => {
    const u = contentsUsage(3);
    expect(u.contentFetches).toBe(3);
    expect(u.searches).toBe(0);
    expect(u.costUsd).toBeCloseTo(3 * EXA_PRICING.contentPageUsd, 10);
  });

  it("is free for zero pages", () => {
    expect(contentsUsage(0).costUsd).toBe(0);
  });
});

describe("real cost from the Exa response (costDollars.total)", () => {
  it("searchUsage uses the real cost when provided, ignoring the estimate", () => {
    const u = searchUsage(10, 0.0231);
    expect(u.searches).toBe(1);
    expect(u.costUsd).toBe(0.0231);
  });

  it("contentsUsage uses the real cost when provided", () => {
    const u = contentsUsage(1, 0.0009);
    expect(u.contentFetches).toBe(1);
    expect(u.costUsd).toBe(0.0009);
  });

  it("falls back to the published-price estimate when real cost is absent", () => {
    expect(searchUsage(10, undefined).costUsd).toBeCloseTo(EXA_PRICING.searchUsd, 10);
    expect(contentsUsage(2, undefined).costUsd).toBeCloseTo(2 * EXA_PRICING.contentPageUsd, 10);
  });

  it("treats a real cost of 0 as real (e.g. free-tier), not missing", () => {
    expect(searchUsage(10, 0).costUsd).toBe(0);
  });
});

describe("addExaUsage", () => {
  it("accumulates every field", () => {
    const total = addExaUsage(searchUsage(12), contentsUsage(1));
    expect(total.searches).toBe(1);
    expect(total.contentFetches).toBe(1);
    expect(total.numResultsOver10).toBe(2);
    expect(total.costUsd).toBeCloseTo(
      EXA_PRICING.searchUsd + 2 * EXA_PRICING.extraResultUsd + EXA_PRICING.contentPageUsd,
      10,
    );
  });
});

describe("sumExaUsage", () => {
  it("returns empty usage for an empty list", () => {
    expect(sumExaUsage([])).toEqual(emptyExaUsage());
  });

  it("sums a typical fresh eval: research search + page + domain enricher search", () => {
    const total = sumExaUsage([searchUsage(10), contentsUsage(1), searchUsage(6)]);
    expect(total.searches).toBe(2);
    expect(total.contentFetches).toBe(1);
    expect(total.costUsd).toBeCloseTo(
      2 * EXA_PRICING.searchUsd + EXA_PRICING.contentPageUsd,
      10,
    );
  });
});
