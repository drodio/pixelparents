import { describe, it, expect } from "vitest";
import { BADGE_SQL_PREDICATES, FILTERABLE_BADGE_IDS } from "@/lib/leaderboard-badge-sql";
import {
  BADGE_FILTER_LABELS,
  FILTERABLE_BADGE_IDS as CLIENT_FILTERABLE_BADGE_IDS,
} from "@/lib/leaderboard-constants";

describe("badge SQL predicates", () => {
  it("covers the full filterable taxonomy", () => {
    for (const id of [
      "claimed", "yc", "serial-founder", "first-founder", "unicorn", "ipo",
      "acquired", "exits", "raised", "employees", "partner", "angel", "deployed",
      "leads-rounds", "on-neo", "pre-seed-focus", "seed-focus", "series-a-focus",
      "series-b-focus", "series-c-focus", "growth-stage-focus", "oss", "wiki", "mm",
    ]) {
      expect(BADGE_SQL_PREDICATES[id]).toBeDefined();
    }
  });

  it("FILTERABLE_BADGE_IDS matches the predicate keys", () => {
    expect(new Set(FILTERABLE_BADGE_IDS)).toEqual(new Set(Object.keys(BADGE_SQL_PREDICATES)));
  });

  // The client UI (sidebar, pills, click-to-filter) can't import the server
  // predicate module, so it derives filterable ids + labels from the DB-free
  // constants module. These MUST stay in sync with the server predicates.
  it("client labels/ids stay in sync with the server predicates", () => {
    const serverIds = new Set(Object.keys(BADGE_SQL_PREDICATES));
    expect(new Set(CLIENT_FILTERABLE_BADGE_IDS)).toEqual(serverIds);
    expect(new Set(Object.keys(BADGE_FILTER_LABELS))).toEqual(serverIds);
    // Every label is a non-empty string.
    for (const id of serverIds) {
      expect(BADGE_FILTER_LABELS[id]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
