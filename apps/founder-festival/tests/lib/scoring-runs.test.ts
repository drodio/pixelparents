import { describe, it, expect } from "vitest";
import { scoringRunValuesFromRow } from "@/lib/scoring-runs";
import { runToDetailData, type ScoringRunDTO } from "@/components/ScoringLogButton";
import type { evaluations } from "@/db/schema";

// A minimal-but-realistic evaluation row. Only the fields scoringRunValuesFromRow
// reads need to be accurate; the rest are filled to satisfy the row type.
function fakeEvalRow(
  over: Partial<typeof evaluations.$inferSelect> = {},
): typeof evaluations.$inferSelect {
  const base = {
    id: "eval-123",
    linkedinUrl: "https://www.linkedin.com/in/jane",
    fullName: "Jane Tester",
    score: 1500,
    founderScore: 900,
    investorScore: 600,
    signalQuality: "high",
    breakdown: {
      founder: [{ points: 900, reason: "Founded a unicorn" }],
      investor: [{ points: 600, reason: "Angel in 3 exits" }],
    },
    profile: { fullName: "Jane Tester", mmHits: [{ domain: "acme.com" }] },
    companyStage: "series-a",
    recommendations: { summary: "Strong", items: [] },
    summarySource: "system",
    summaryStatus: "likely",
    summaryConfidence: 80,
    summaryOriginalText: null,
    slug: "jane-tester",
    slugKind: "founder",
    exaGrounding: { sources: [{ url: "https://acme.com/about" }] },
    pricing: {},
    investorStageFocus: [],
    investorIndustryFocus: [],
    investorLeadsRounds: null,
    investorCheckSize: null,
    onNeo: null,
    neoSlug: null,
    costLlmCents: 12,
    costExaCents: 3,
    costTotalCents: 15,
    source: "url",
    sourceCode: null,
    requestIp: null,
    requestCity: null,
    requestRegion: null,
    requestCountry: null,
    subjectCity: null,
    subjectRegion: null,
    subjectCountry: null,
    subjectLocationRaw: null,
    subjectLocationSource: null,
    phone: null,
    jobTitle: null,
    foundEmail: null,
    foundEmailStatus: null,
    foundEmailAt: null,
    foundEmailBy: null,
    findEmailQueuedAt: null,
    findEmailQueuedBy: null,
    findEmailBillable: null,
    hiddenAt: null,
    hiddenByClerkUserId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-03-15T12:30:00Z"),
  };
  return { ...base, ...over } as typeof evaluations.$inferSelect;
}

describe("scoringRunValuesFromRow", () => {
  it("mirrors the scalar columns from the evaluation row", () => {
    const v = scoringRunValuesFromRow(fakeEvalRow(), { model: "opus" });
    expect(v.evaluationId).toBe("eval-123");
    expect(v.founderScore).toBe(900);
    expect(v.investorScore).toBe(600);
    expect(v.score).toBe(1500);
    expect(v.signalQuality).toBe("high");
    expect(v.companyStage).toBe("series-a");
    expect(v.source).toBe("url");
    expect(v.sourceCode).toBeNull();
    expect(v.model).toBe("opus");
    expect(v.costTotalCents).toBe(15);
  });

  it("captures everything Score Detail needs in the snapshot", () => {
    const v = scoringRunValuesFromRow(fakeEvalRow());
    expect(v.snapshot).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane",
      breakdown: {
        founder: [{ points: 900, reason: "Founded a unicorn" }],
        investor: [{ points: 600, reason: "Angel in 3 exits" }],
      },
    });
    // grounding + profile + recommendations are preserved verbatim
    expect((v.snapshot as { exaGrounding: unknown }).exaGrounding).toEqual({
      sources: [{ url: "https://acme.com/about" }],
    });
    expect((v.snapshot as { profile: { mmHits: unknown } }).profile).toMatchObject({
      mmHits: [{ domain: "acme.com" }],
    });
  });

  it("defaults model to null and omits createdAt for live runs", () => {
    const v = scoringRunValuesFromRow(fakeEvalRow());
    expect(v.model).toBeNull();
    expect(v.createdAt).toBeUndefined(); // column default now() applies
  });

  it("uses the provided createdAt (backfill seeds from updatedAt)", () => {
    const row = fakeEvalRow();
    const v = scoringRunValuesFromRow(row, { createdAt: row.updatedAt });
    expect(v.createdAt).toEqual(new Date("2026-03-15T12:30:00Z"));
  });

  it("falls back to an empty breakdown when the row has none (low-signal)", () => {
    const v = scoringRunValuesFromRow(fakeEvalRow({ breakdown: null }));
    expect(v.snapshot.breakdown).toEqual({ founder: [], investor: [] });
  });

  it("captures eval-row-only scoring fields in snapshot.meta", () => {
    const v = scoringRunValuesFromRow(
      fakeEvalRow({
        investorStageFocus: ["seed", "series-a"],
        investorLeadsRounds: true,
        onNeo: true,
        neoSlug: "jane",
        summaryConfidence: 80,
      }),
    );
    expect(v.snapshot.meta).toMatchObject({
      fullName: "Jane Tester",
      pricing: {},
      costLlmCents: 12,
      costExaCents: 3,
      costTotalCents: 15,
      investorStageFocus: ["seed", "series-a"],
      investorLeadsRounds: true,
      onNeo: true,
      neoSlug: "jane",
      summarySource: "system",
      summaryStatus: "likely",
      summaryConfidence: 80,
      slug: "jane-tester",
      slugKind: "founder",
    });
  });
});

describe("snapshot round-trips back into Score Detail props", () => {
  it("eval row -> run values -> API DTO -> ScoreDetailData preserves the run", () => {
    const row = fakeEvalRow();
    const values = scoringRunValuesFromRow(row, { model: "opus", createdAt: row.updatedAt });

    // Simulate what the GET /scoring-runs route serializes back to the client.
    const dto: ScoringRunDTO = {
      id: "run-1",
      evaluationId: values.evaluationId,
      createdAt: (values.createdAt as Date).toISOString(),
      founderScore: values.founderScore,
      investorScore: values.investorScore,
      score: values.score,
      signalQuality: values.signalQuality,
      companyStage: values.companyStage ?? null,
      source: values.source,
      sourceCode: values.sourceCode ?? null,
      model: values.model ?? null,
      costTotalCents: values.costTotalCents ?? null,
      snapshot: values.snapshot,
    };

    const detail = runToDetailData(dto);
    // meta round-trips so the verbose Score Detail can render facets/pricing/etc.
    expect(detail.meta).toMatchObject({ fullName: "Jane Tester", costTotalCents: 15 });
    expect(detail.evaluationId).toBe("eval-123");
    expect(detail.linkedinUrl).toBe("https://www.linkedin.com/in/jane");
    expect(detail.founderScore).toBe(900);
    expect(detail.investorScore).toBe(600);
    expect(detail.combinedScore).toBe(1500);
    expect(detail.signalQuality).toBe("high");
    expect(detail.companyStage).toBe("series-a");
    expect(detail.founderBreakdown).toEqual([{ points: 900, reason: "Founded a unicorn" }]);
    expect(detail.investorBreakdown).toEqual([{ points: 600, reason: "Angel in 3 exits" }]);
    expect(detail.recommendations).toMatchObject({ summary: "Strong" });
    // A run is a point-in-time fact: created === updated for the detail view.
    expect(detail.createdAt).toBe(detail.updatedAt);
  });
});
