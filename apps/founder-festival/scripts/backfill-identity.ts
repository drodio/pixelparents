// Backfill evaluations.profile.identity from data ALREADY stored on each row.
//
// New scores/re-scores get profile.identity via buildIdentity() in the pipeline.
// This reconstructs it for OLD rows using their stored enrichment `raw` blobs +
// extractedMetrics + primaryCompanyDomain — NO LLM calls, so it is free and
// safe to re-run. LLM-only fields (jobTitle, headline, structured location,
// websiteUrl, education) stay null on old rows until they're naturally
// re-scored; everything reconstructable from stored data is filled.
//
// Usage:
//   DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config scripts/backfill-identity.ts          # dry run
//   DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config scripts/backfill-identity.ts --commit  # write
//   ... --force   # also overwrite rows that already have an identity block
//
// Per repo deploy rules (separate dev/prod Neon DBs; never db:push from a
// checkout), point DATABASE_URL at the intended environment deliberately.

import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { buildIdentity } from "@/lib/identity";
import type { EnrichmentResult } from "@/lib/enrichers/types";

const COMMIT = process.argv.includes("--commit");
const FORCE = process.argv.includes("--force");

type StoredProfile = {
  primaryCompanyDomain?: string | null;
  extractedMetrics?: Record<string, unknown> | null;
  enrichments?: Array<{ source: string; raw?: unknown }>;
  identity?: unknown;
  [k: string]: unknown;
};

async function main() {
  const rows = await db
    .select({ id: evaluations.id, profile: evaluations.profile })
    .from(evaluations)
    .where(isNotNull(evaluations.profile));

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const profile = (row.profile as StoredProfile | null) ?? null;
    if (!profile) {
      skipped++;
      continue;
    }
    if (profile.identity && !FORCE) {
      skipped++;
      continue;
    }

    // Stored enrichments only retain `raw` (facts/citations were reduced to
    // counts), which is exactly what buildIdentity reads off the enricher data.
    const enrichments: EnrichmentResult[] = (profile.enrichments ?? []).map((e) => ({
      source: e.source as EnrichmentResult["source"],
      facts: [],
      citations: [],
      raw: e.raw,
    }));

    const identity = buildIdentity({
      llm: null, // no LLM rerun in backfill
      enrichments,
      extractedMetrics: (profile.extractedMetrics as never) ?? null,
      primaryCompanyDomain: profile.primaryCompanyDomain ?? null,
    });

    if (COMMIT) {
      await db
        .update(evaluations)
        .set({ profile: { ...profile, identity } })
        .where(eq(evaluations.id, row.id));
    }
    updated++;
    if (updated <= 5) {
      console.log(`  ${row.id} → company=${identity.companyName ?? "—"} investor=${identity.investor ? "yes" : "no"}`);
    }
  }

  console.log(
    `\n${COMMIT ? "WROTE" : "DRY RUN"}: ${updated} row(s) ${COMMIT ? "updated" : "would update"}, ${skipped} skipped (no profile / already has identity).`,
  );
  if (!COMMIT) console.log("Re-run with --commit to write.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
