import { describe, it, expect } from "vitest";
import { buildRevenueSummary, type LedgerAgg, type Identity } from "@/lib/revenue";

const aggs: LedgerAgg[] = [
  { clerkUserId: "u_api", grossTopupCents: 348000, refundedCents: 20000 },
  { clerkUserId: "u_admin", grossTopupCents: 400000, refundedCents: 0 },
  { clerkUserId: "u_dev", grossTopupCents: 100000, refundedCents: 0 },
];
const balances = new Map([
  ["u_api", 98000],
  ["u_admin", 390000],
  // u_dev intentionally missing → remaining 0
]);
const identities = new Map<string, Identity>([
  ["u_api", { label: "pat@acme.com", kind: "api" }],
  ["u_admin", { label: "drodio@gmail.com", kind: "admin" }],
]);

describe("buildRevenueSummary", () => {
  it("computes net purchased (gross − refunds) and sorts by net desc", () => {
    const s = buildRevenueSummary(aggs, balances, identities);
    expect(s.rows.map((r) => r.clerkUserId)).toEqual(["u_admin", "u_api", "u_dev"]);
    const api = s.rows.find((r) => r.clerkUserId === "u_api")!;
    expect(api.purchasedNetCents).toBe(348000 - 20000);
    expect(api.refundedCents).toBe(20000);
    expect(api.remainingCents).toBe(98000);
    expect(api.label).toBe("pat@acme.com");
    expect(api.kind).toBe("api");
  });

  it("totals are net and remaining sums balances", () => {
    const s = buildRevenueSummary(aggs, balances, identities);
    expect(s.totalNetCents).toBe(328000 + 400000 + 100000);
    expect(s.totalRefundedCents).toBe(20000);
    expect(s.totalRemainingCents).toBe(98000 + 390000 + 0);
    expect(s.hasRefunds).toBe(true);
  });

  it("falls back to the clerk id + 'user' kind when identity is unresolved", () => {
    const s = buildRevenueSummary(aggs, balances, identities);
    const dev = s.rows.find((r) => r.clerkUserId === "u_dev")!;
    expect(dev.label).toBe("u_dev");
    expect(dev.kind).toBe("user");
    expect(dev.remainingCents).toBe(0);
  });

  it("hasRefunds is false when nobody was refunded", () => {
    const clean = aggs.map((a) => ({ ...a, refundedCents: 0 }));
    expect(buildRevenueSummary(clean, balances, identities).hasRefunds).toBe(false);
  });
});
