import { describe, it, expect } from "vitest";
import { parseSelectedSources, matchesSourceFilter } from "@/lib/profiles-scored";

// The "re-score stale profiles" job lets the operator pick which sources to
// include (Web / Bulk / API checkboxes). Source is DERIVED (classifyProfileSource:
// charged → api, job-linked → bulk, else web), so the filter reuses it.
describe("parseSelectedSources", () => {
  it("keeps the valid requested sources", () => {
    expect(parseSelectedSources(["web", "api"])).toEqual(["web", "api"]);
    expect(parseSelectedSources(["bulk"])).toEqual(["bulk"]);
  });

  it("defaults to all sources when empty, missing, or all-invalid", () => {
    expect(parseSelectedSources([])).toEqual(["web", "bulk", "api"]);
    expect(parseSelectedSources(undefined)).toEqual(["web", "bulk", "api"]);
    expect(parseSelectedSources(["bogus"])).toEqual(["web", "bulk", "api"]);
  });

  it("drops invalid entries but keeps valid ones", () => {
    expect(parseSelectedSources(["web", "bogus"])).toEqual(["web"]);
  });
});

describe("matchesSourceFilter", () => {
  it("includes a charged profile only when API is selected", () => {
    expect(matchesSourceFilter({ chargeCents: 70, isBulk: false }, ["api"])).toBe(true);
    expect(matchesSourceFilter({ chargeCents: 70, isBulk: false }, ["web", "bulk"])).toBe(false);
  });

  it("includes a bulk profile only when Bulk is selected", () => {
    expect(matchesSourceFilter({ chargeCents: 0, isBulk: true }, ["bulk"])).toBe(true);
    expect(matchesSourceFilter({ chargeCents: 0, isBulk: true }, ["web"])).toBe(false);
  });

  it("includes an uncharged non-bulk (web) profile only when Web is selected", () => {
    expect(matchesSourceFilter({ chargeCents: 0, isBulk: false }, ["web"])).toBe(true);
    expect(matchesSourceFilter({ chargeCents: 0, isBulk: false }, ["bulk", "api"])).toBe(false);
  });
});
