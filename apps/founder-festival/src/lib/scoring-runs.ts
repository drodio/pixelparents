import { db } from "@/db";
import { evaluations, scoringRuns } from "@/db/schema";

// One immutable snapshot per scoring run. Built straight from the persisted
// evaluation row — everything Score Detail needs already lives there after the
// write — so the live write-hook (recordScoringRun) and the one-time backfill
// share exactly one definition of "what a run looks like".

type EvalRow = typeof evaluations.$inferSelect;
type ScoringRunInsert = typeof scoringRuns.$inferInsert;

const EMPTY_BREAKDOWN = { founder: [], investor: [] };

export function scoringRunValuesFromRow(
  row: EvalRow,
  opts: { model?: string | null; createdAt?: Date } = {},
): ScoringRunInsert {
  return {
    evaluationId: row.id,
    founderScore: row.founderScore,
    investorScore: row.investorScore,
    score: row.score,
    signalQuality: row.signalQuality,
    companyStage: row.companyStage,
    source: row.source,
    sourceCode: row.sourceCode,
    model: opts.model ?? null,
    costTotalCents: row.costTotalCents,
    snapshot: {
      linkedinUrl: row.linkedinUrl,
      breakdown: row.breakdown ?? EMPTY_BREAKDOWN,
      recommendations: row.recommendations ?? null,
      exaGrounding: row.exaGrounding ?? null,
      profile: row.profile ?? null,
      // Scoring-relevant eval-row fields that don't live in `profile` — so a
      // historical run can render the full verbose Score Detail (see ScoreDetailMeta).
      meta: {
        fullName: row.fullName,
        pricing: row.pricing ?? null,
        costLlmCents: row.costLlmCents,
        costExaCents: row.costExaCents,
        costTotalCents: row.costTotalCents,
        investorStageFocus: row.investorStageFocus ?? null,
        investorIndustryFocus: row.investorIndustryFocus ?? null,
        investorLeadsRounds: row.investorLeadsRounds,
        investorCheckSize: row.investorCheckSize ?? null,
        onNeo: row.onNeo,
        neoSlug: row.neoSlug,
        summarySource: row.summarySource,
        summaryStatus: row.summaryStatus,
        summaryConfidence: row.summaryConfidence,
        summaryOriginalText: row.summaryOriginalText,
        subjectCity: row.subjectCity,
        subjectRegion: row.subjectRegion,
        subjectCountry: row.subjectCountry,
        slug: row.slug,
        slugKind: row.slugKind,
      },
    },
    // Backfill passes the evaluation's updatedAt; live runs let the column
    // default to now().
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  };
}

// Best-effort: callers wrap this in .catch() so a history-write failure can
// never fail a paid score. `model` is the scoring model id when known.
export async function recordScoringRun(
  row: EvalRow,
  model?: string | null,
): Promise<void> {
  await db.insert(scoringRuns).values(scoringRunValuesFromRow(row, { model }));
}
