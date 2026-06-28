import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/exa", () => ({
  researchLinkedinProfile: vi.fn(async () => ({
    searchHighlights: [
      {
        url: "https://acme.com/about",
        title: "About Acme",
        highlights: ["Jane founded Acme in 2021", "Raised $2M seed in 2023"],
      },
    ],
    linkedinPageText: "",
    grounding: { test: true },
    // 1 deep search (10 results) + 1 content page = $0.008.
    exaUsage: { searches: 1, contentFetches: 1, costUsd: 0.008, numResultsOver10: 0 },
  })),
  extractCandidateDomains: vi.fn(() => ["acme.com"]),
  getExaClient: vi.fn(),
}));

// eval-pipeline switched from generateObject() to generateText() + manual
// JSON parse to work around Vercel AI Gateway's structured-output mangling.
// The mock now returns a JSON string instead of a parsed object.
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: JSON.stringify({
      fullName: "Jane Tester",
      primaryCompanyDomain: "acme.com",
      publicEmail: null,
      githubUsername: null,
      founderScore: 30,
      investorScore: 0,
      combinedScore: 30,
      signalQuality: "high",
      companyStage: "seed",
      extractedMetrics: {
        companiesFounded: 1,
        totalRaisedUsd: 2000000,
        exitCount: null,
        hadIpo: false,
        hadAcquisition: false,
        employeesCount: null,
        isUnicornFounder: false,
        ycBatch: null,
        partnerAtFirm: null,
        isAngelInvestor: false,
        totalDeployedUsd: null,
        topGithubRepo: null,
        topGithubRepoStars: null,
        onWikipedia: false,
      },
      founderBreakdown: [
        { points: 10, reason: "Currently founder of Acme", confidence: 80 },
        { points: 20, reason: "Raised $2M for Acme → +20 (10×2)", confidence: 70 },
      ],
      investorBreakdown: [],
      summaryConfidence: 60,
      recommendations: { summary: "x", items: [] },
    }),
    usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 0 },
    // Gateway reports the real per-generation cost inline; the pipeline uses
    // this verbatim. Equals the opus token-math here so cent assertions hold.
    providerMetadata: { gateway: { cost: "0.00525", generationId: "gen_test123" } },
  })),
}));

import { runEval } from "@/lib/eval-pipeline";
import { IS_PROD_DB } from "../setup";

describe.skipIf(IS_PROD_DB)("runEval", () => {
  const testUrl = "https://linkedin.com/in/jane-tester-eval";

  beforeEach(async () => {
    await db.delete(evaluations).where(eq(evaluations.linkedinUrl, testUrl));
  });
  afterEach(async () => {
    await db.delete(evaluations).where(eq(evaluations.linkedinUrl, testUrl));
  });

  it("scores a fresh LinkedIn URL end to end (with mocks)", async () => {
    const r = await runEval(testUrl);
    expect(r.status).toBe("scored");
    expect(r.combinedScore).toBe(30);
    expect(r.founderScore).toBe(30);
    expect(r.investorScore).toBe(0);
    expect(r.founderBreakdown.length).toBe(2);
    expect(r.investorBreakdown.length).toBe(0);
  });

  it("persists real per-eval cost on the row (LLM + Exa)", async () => {
    await runEval(testUrl);
    const [row] = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.linkedinUrl, testUrl))
      .limit(1);
    // LLM: 100 input + 50 output tokens on opus = (100*15 + 50*75)/1e6 = $0.00525.
    expect(row!.costLlmCents).toBe(1); // round($0.00525 * 100)
    // Exa from the mock = $0.008 → 1 cent.
    expect(row!.costExaCents).toBe(1);
    expect(row!.costTotalCents).toBe(1); // round(($0.00525 + $0.008) * 100) = round(1.325)
    const pricing = row!.pricing as {
      llm: { costUsd: number; costSource: string; generationId?: string } | null;
      exa: { costUsd: number };
      totalUsd: number;
    };
    expect(pricing.llm?.costUsd).toBeCloseTo(0.00525, 6);
    // Real cost came from the gateway, not the token estimate.
    expect(pricing.llm?.costSource).toBe("gateway");
    expect(pricing.llm?.generationId).toBe("gen_test123");
    expect(pricing.exa.costUsd).toBeCloseTo(0.008, 6);
    expect(pricing.totalUsd).toBeCloseTo(0.01325, 6);
  });

  it("returns cached on repeat", async () => {
    const r1 = await runEval(testUrl);
    const r2 = await runEval(testUrl);
    expect(r2.evaluationId).toBe(r1.evaluationId);
    expect(r2.combinedScore).toBe(30);
  });

  it("handles low-signal (no search results)", async () => {
    const { researchLinkedinProfile } = await import("@/lib/exa");
    (researchLinkedinProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      searchHighlights: [],
      linkedinPageText: "",
      grounding: null,
      exaUsage: { searches: 1, contentFetches: 0, costUsd: 0.007, numResultsOver10: 0 },
    });
    const altUrl = "https://linkedin.com/in/jane-low-signal";
    await db.delete(evaluations).where(eq(evaluations.linkedinUrl, altUrl));
    const r = await runEval(altUrl);
    expect(r.status).toBe("low-signal");
    expect(r.combinedScore).toBe(0);
    await db.delete(evaluations).where(eq(evaluations.linkedinUrl, altUrl));
  });
});
