/**
 * One-time backfill: seed `scoring_runs` with the CURRENT score of every
 * evaluation that has no history yet, dated by the evaluation's updatedAt.
 *
 * Idempotent — re-running only inserts for evaluations still missing a run, so
 * it's safe to run on dev now and on prod at deploy time. Uses the app db
 * (DATABASE_URL = dev in this repo's .env.local). To target prod, export
 * DATABASE_URL=$POSTGRES_URL first.
 *
 *   npm run backfill-scoring-runs
 *   # or: DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/backfill-scoring-runs.ts
 *
 * Reads in small chunks: the full evaluations rows carry large `profile` JSON
 * blobs, and selecting them all at once exceeds the Neon HTTP driver's 64MB
 * response cap on a big DB. We fetch ids first, then read+insert one chunk at a
 * time.
 *
 * NOTE: earlier re-score history is unrecoverable (reEvaluate overwrote the row),
 * so each profile gets exactly one seeded run = its current score.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, scoringRuns } from "@/db/schema";
import { scoringRunValuesFromRow } from "@/lib/scoring-runs";

// Small enough that one chunk of full rows (with profile/grounding blobs) stays
// well under Neon's 64MB HTTP response limit, even for the largest profiles.
const CHUNK = 25;

async function main() {
  const seededRows = await db
    .select({ id: scoringRuns.evaluationId })
    .from(scoringRuns);
  const seeded = new Set(seededRows.map((r) => r.id));

  // Ids only — cheap, no big blobs.
  const allIds = (await db.select({ id: evaluations.id }).from(evaluations)).map((r) => r.id);
  const todo = allIds.filter((id) => !seeded.has(id));

  console.log(
    `evaluations: ${allIds.length} · already seeded: ${seeded.size} · to insert: ${todo.length}`,
  );

  let inserted = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const ids = todo.slice(i, i + CHUNK);
    const rows = await db.select().from(evaluations).where(inArray(evaluations.id, ids));
    const values = rows.map((row) => scoringRunValuesFromRow(row, { createdAt: row.updatedAt }));
    if (values.length) await db.insert(scoringRuns).values(values);
    inserted += values.length;
    console.log(`  inserted ${inserted}/${todo.length}`);
  }

  console.log("Backfill done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
