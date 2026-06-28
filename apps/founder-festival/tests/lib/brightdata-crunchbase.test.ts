import { describe, it, expect } from "vitest";
import {
  crunchbaseSlug,
  corroborateCompany,
  crunchbaseFacts,
} from "@/lib/enrichers/brightdata-crunchbase";
import type { BrightDataCrunchbaseCompany } from "@/lib/brightdata";

describe("crunchbaseSlug", () => {
  it("slugifies company names", () => {
    expect(crunchbaseSlug("Storytell.ai")).toBe("storytell-ai");
    expect(crunchbaseSlug("Signal from Noise, Inc.")).toBe("signal-from-noise-inc");
    expect(crunchbaseSlug("Stripe")).toBe("stripe");
    expect(crunchbaseSlug("Ben & Jerry's")).toBe("ben-and-jerry-s");
  });
});

const REC = (over: Partial<BrightDataCrunchbaseCompany>): BrightDataCrunchbaseCompany => ({
  name: "Stripe",
  website: "https://stripe.com",
  ...over,
});

describe("corroborateCompany", () => {
  it("corroborates when a founder matches the subject", () => {
    const rec = REC({ founders: [{ value: "Sam Rivera" }, { value: "Alex Kim" }] });
    expect(corroborateCompany(rec, "Stripe", "Sam Rivera", new Set())).toBe(true);
  });
  it("corroborates when the website domain is in the subject's footprint", () => {
    const rec = REC({ website: "https://stripe.com", founders: [] });
    expect(corroborateCompany(rec, "Stripe", "Nobody Match", new Set(["stripe.com"]))).toBe(true);
  });
  it("does NOT corroborate an employee of a big company (no founder + no domain)", () => {
    const rec = REC({ founders: [{ value: "Sam Rivera" }] });
    // a random engineer who lists Stripe but isn't a founder and whose footprint
    // doesn't include stripe.com
    expect(corroborateCompany(rec, "Stripe", "Some Engineer", new Set(["someengineer.dev"]))).toBe(false);
  });
  it("does NOT corroborate when the company name doesn't match", () => {
    const rec = REC({ name: "Stripe", founders: [{ value: "Sam Rivera" }] });
    expect(corroborateCompany(rec, "Plaid", "Sam Rivera", new Set())).toBe(false);
  });
});

describe("crunchbaseFacts", () => {
  it("surfaces acquisition, employees, traffic, downloads as facts (no points)", () => {
    const facts = crunchbaseFacts(
      REC({
        name: "Socialcast",
        num_employees: "11-50",
        operating_status: "closed",
        acquired_by: { acquirer: "VMware", transaction_name: "Socialcast acquired by VMware" },
        monthly_visits: 250000,
        apptopia_total_downloads: 1200000,
      }),
    );
    const joined = facts.join("\n");
    expect(joined).toMatch(/ACQUIRED by VMware/);
    expect(joined).toMatch(/11-50 employees/);
    expect(joined).toMatch(/250,000 monthly website visits/);
    expect(joined).toMatch(/1,200,000 total downloads/);
    // never leaks point values
    expect(joined).not.toMatch(/\+\d+\s*(point|pts)/i);
  });
  it("returns nothing for an empty record", () => {
    expect(crunchbaseFacts(REC({ name: "X", website: null }))).toEqual([]);
  });
});
