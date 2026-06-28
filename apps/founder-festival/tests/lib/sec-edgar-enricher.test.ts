import { describe, it, expect } from "vitest";
import { isInvestmentFund, buildIssuerFacts, type Issuer } from "@/lib/enrichers/sec-edgar";

describe("isInvestmentFund", () => {
  it("classifies pooled / VC / PE / hedge industry groups as funds", () => {
    expect(isInvestmentFund("Pooled Investment Fund")).toBe(true);
    expect(isInvestmentFund("Venture Capital")).toBe(true);
    expect(isInvestmentFund("Private Equity Fund")).toBe(true);
    expect(isInvestmentFund("Hedge Fund")).toBe(true);
  });

  it("classifies operating-company industry groups (and null) as NOT funds", () => {
    expect(isInvestmentFund("Technology")).toBe(false);
    expect(isInvestmentFund("Other Health Care")).toBe(false);
    expect(isInvestmentFund(null)).toBe(false);
  });
});

describe("buildIssuerFacts", () => {
  const operating = (over: Partial<Issuer> = {}): Issuer => ({
    entityName: "Stripe, Inc.",
    cik: "123",
    industryGroup: "Technology",
    isIpo: false,
    filings: [{ date: "2024-01-01", sold: 200_000_000, offering: 200_000_000, url: "u" }],
    ...over,
  });

  it("renders a founder-raise fact for an operating company", () => {
    const [fact] = buildIssuerFacts(operating(), "Patrick Collison");
    expect(fact).toContain(
      "Patrick Collison is a named related person on an exempt-offering filing by Stripe, Inc.",
    );
    expect(fact).toContain("largest offering $200M sold");
    expect(fact).toContain("most recent 2024-01-01");
  });

  it("omits the offering clause when no amount was sold", () => {
    const [fact] = buildIssuerFacts(
      operating({ filings: [{ date: null, sold: 0, offering: 0, url: "u" }] }),
      "Jane Doe",
    );
    expect(fact).not.toContain("largest offering");
  });

  it("adds an authoritative IPO/exit fact when the operating company has gone public", () => {
    const facts = buildIssuerFacts(operating({ isIpo: true }), "Patrick Collison");
    expect(facts).toHaveLength(2);
    expect(facts[1]).toContain("gone public");
    expect(facts[1]).toContain("Stripe, Inc.");
  });

  it("renders a fund-manager/GP fact (not a founder raise) for an investment fund", () => {
    const fund: Issuer = {
      entityName: "Everywhere Ventures Fund I, L.P.",
      cik: "456",
      industryGroup: "Pooled Investment Fund",
      isIpo: false,
      filings: [{ date: "2023-06-01", sold: 10_000_000, offering: 25_000_000, url: "u" }],
    };
    const [fact] = buildIssuerFacts(fund, "Jenny Fielding");
    expect(fact).toContain("fund manager / GP");
    expect(fact).toContain("pooled investment fund");
    // fund size prefers the offering amount (fund target) over committed-to-date
    expect(fact).toContain("fund size $25M");
    expect(fact).not.toContain("largest offering");
  });
});
