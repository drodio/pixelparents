import { describe, it, expect } from "vitest";
import { SCORING_SCHEMA, EXTRACTED_METRICS_SCHEMA } from "@/lib/scoring";

describe("SCORING_SCHEMA", () => {
  it("accepts investorStageFocus as array of stage strings", () => {
    const parsed = SCORING_SCHEMA.safeParse({
      fullName: "X", primaryCompanyDomain: null, publicEmail: null, githubUsername: null,
      founderScore: 0, investorScore: 0, combinedScore: 0,
      signalQuality: "high", companyStage: null, founderStatus: "never", investorStatus: "never",
      investorStageFocus: ["pre-seed", "seed"],
      extractedMetrics: { companiesFounded: null, totalRaisedUsd: null, exitCount: null, hadIpo: null, hadAcquisition: null, employeesCount: null, isUnicornFounder: null, ycBatch: null, partnerAtFirm: null, isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null, topGithubRepoStars: null, onWikipedia: null },
      founderBreakdown: [], investorBreakdown: [],
      recommendations: { summary: "x", items: [] },
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults investorStageFocus to empty array when omitted", () => {
    const parsed = SCORING_SCHEMA.safeParse({
      fullName: "X", primaryCompanyDomain: null, publicEmail: null, githubUsername: null,
      founderScore: 0, investorScore: 0, combinedScore: 0,
      signalQuality: "high", companyStage: null, founderStatus: "never", investorStatus: "never",
      extractedMetrics: { companiesFounded: null, totalRaisedUsd: null, exitCount: null, hadIpo: null, hadAcquisition: null, employeesCount: null, isUnicornFounder: null, ycBatch: null, partnerAtFirm: null, isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null, topGithubRepoStars: null, onWikipedia: null },
      founderBreakdown: [], investorBreakdown: [],
      recommendations: { summary: "x", items: [] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.investorStageFocus).toEqual([]);
  });
});

describe("exit value metrics", () => {
  it("accepts ipoMarketCapUsd and acquisitionPriceUsd as nullable ints", () => {
    const parsed = EXTRACTED_METRICS_SCHEMA.parse({
      companiesFounded: 1, totalRaisedUsd: null, exitCount: 1,
      hadIpo: true, hadAcquisition: false, employeesCount: null,
      isUnicornFounder: true, ycBatch: null, partnerAtFirm: null,
      isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null,
      topGithubRepoStars: null, onWikipedia: null,
      ipoMarketCapUsd: 11_000_000_000, acquisitionPriceUsd: null,
    });
    expect(parsed.ipoMarketCapUsd).toBe(11_000_000_000);
    expect(parsed.acquisitionPriceUsd).toBeNull();
  });

  it("defaults the new fields to null when omitted", () => {
    const parsed = EXTRACTED_METRICS_SCHEMA.parse({
      companiesFounded: null, totalRaisedUsd: null, exitCount: null,
      hadIpo: null, hadAcquisition: null, employeesCount: null,
      isUnicornFounder: null, ycBatch: null, partnerAtFirm: null,
      isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null,
      topGithubRepoStars: null, onWikipedia: null,
    });
    expect(parsed.ipoMarketCapUsd).toBeNull();
    expect(parsed.acquisitionPriceUsd).toBeNull();
    expect(parsed.peakValuationUsd).toBeNull();
  });

  it("accepts peakValuationUsd (private valuation, feeds founder_valuation)", () => {
    const parsed = EXTRACTED_METRICS_SCHEMA.parse({
      companiesFounded: 2, totalRaisedUsd: 180_000_000, exitCount: null,
      hadIpo: null, hadAcquisition: null, employeesCount: null,
      isUnicornFounder: true, ycBatch: null, partnerAtFirm: null,
      isAngelInvestor: null, totalDeployedUsd: null, topGithubRepo: null,
      topGithubRepoStars: null, onWikipedia: null,
      peakValuationUsd: 1_500_000_000,
    });
    expect(parsed.peakValuationUsd).toBe(1_500_000_000);
  });
});
