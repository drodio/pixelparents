import { describe, it, expect } from "vitest";
import {
  getStats,
  getBreakdowns,
  getTrends,
  hasFilters,
  K_ANON,
  COMPLETED,
  completedFamily,
} from "@/lib/db/aggregates";

// No DATABASE_URL in the test env, so every aggregate takes the graceful
// "pending" path — verifying it never throws and degrades to safe defaults.

describe("aggregates (no DB → pending)", () => {
  it("K_ANON is 5", () => {
    expect(K_ANON).toBe(5);
  });

  it("COMPLETED predicate keys on the minted share_token (+ name/email), not the drifted notified flag", () => {
    // The map / breakdowns must share the SAME completed-only predicate getStats
    // uses. share_token is completeSignup's durable artifact; notified drifted.
    expect(COMPLETED).toBe("(share_token IS NOT NULL AND btrim(first_name) <> '' AND btrim(email) <> '')");
    expect(COMPLETED).not.toContain("notified");
  });

  it("completedFamily scopes a child table to completed families via the shared, alias-qualified predicate", () => {
    const frag = completedFamily("ch");
    expect(frag).toContain("ch.family_id");
    expect(frag).toContain("FROM signups s");
    // The predicate columns are qualified to the correlated alias `s`.
    expect(frag).toContain("s.share_token IS NOT NULL");
    expect(frag).toContain("btrim(s.first_name)");
    expect(frag.startsWith("EXISTS (SELECT 1")).toBe(true);
  });

  it("hasFilters detects an active filter", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ state: "California" })).toBe(true);
    expect(hasFilters({ state: "" })).toBe(false);
  });

  it("getStats degrades to pending", async () => {
    const s = await getStats();
    expect(s.database).toBe("pending");
    expect(s.total_signups).toBe(0);
    expect(s.total_children).toBe(0);
  });

  it("getStats echoes filters when filtered", async () => {
    const s = await getStats({ state: "California" });
    expect(s.filters?.state).toBe("California");
    expect(s.suppressed).toBe(false);
  });

  it("getBreakdowns degrades to pending", async () => {
    const b = await getBreakdowns();
    expect(b.database).toBe("pending");
    expect(b.top_interests).toEqual([]);
    expect(b.skillsets_by_tech_depth).toEqual({});
  });

  it("getTrends degrades to pending and keeps the interval", async () => {
    const t = await getTrends("month");
    expect(t.database).toBe("pending");
    expect(t.interval).toBe("month");
    expect(t.points).toEqual([]);
  });
});
