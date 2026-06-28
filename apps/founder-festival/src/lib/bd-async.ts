import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { triggerBdSnapshot, getSnapshotStatus, downloadBdSnapshot } from "./brightdata";
import { BD_DATASETS, type BdRowCtx } from "./bd-datasets";

// Async BrightData enrichment engine, generic over the BD_DATASETS registry. A
// collection is ~19–60s — too slow to block an eval — so: post-scoring,
// maybeTriggerBdAsync() queues collections for whichever datasets can resolve an
// input now (chained ones resolve once their dependency caches); the bd-async-sweep
// cron polls pending snapshots, corroborates + caches the facts under
// evaluations.bd_async[key], and re-scores so the facts fold in. The per-dataset
// enrichers (read-only) emit the cached facts. Best-effort throughout; a terminal
// empty-facts marker stops re-triggering. State per dataset:
//   bd_async[key] = { pending?: {snapshotId, input, at}, data?: {facts, raw} }

const FRESH_MS = 30 * 60 * 1000; // don't re-queue while a collection is in flight
const STALE_MS = 60 * 60 * 1000; // give up on a snapshot that never finishes

type Entry = { pending?: { snapshotId: string; input: Record<string, unknown>; at: string }; data?: { facts: string[]; raw: unknown } };
type BdAsync = Record<string, Entry>;

function ageMs(iso: string | undefined): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Date.now() - t : Infinity;
}

// Pull the BrightData LinkedIn enricher's raw record out of the stored profile
// (it carries current_company.company_id, used to resolve the LinkedIn Company input).
function linkedinRawOf(profile: unknown): BdRowCtx["linkedinRaw"] {
  const enrichments = (profile as { enrichments?: Array<{ source?: string; raw?: unknown }> } | null)?.enrichments;
  const bd = enrichments?.find((e) => e?.source === "brightdata");
  return (bd?.raw as BdRowCtx["linkedinRaw"]) ?? null;
}

function rowCtx(row: { fullName: string | null; profile: unknown; bdAsync: BdAsync | null }): BdRowCtx {
  return {
    fullName: row.fullName,
    profile: row.profile,
    linkedinRaw: linkedinRawOf(row.profile),
    bdAsync: row.bdAsync ?? {},
  };
}

// Queue any datasets that can resolve an input now and aren't already done /
// in-flight. Returns the updated bd_async map (or null if nothing changed).
async function queueDatasets(
  rowId: string,
  bdAsync: BdAsync,
  ctx: BdRowCtx,
): Promise<BdAsync | null> {
  let changed = false;
  const next: BdAsync = { ...bdAsync };
  for (const ds of BD_DATASETS) {
    const entry = next[ds.key];
    if (entry?.data) continue; // resolved (data or terminal-empty)
    if (entry?.pending && ageMs(entry.pending.at) < FRESH_MS) continue; // in flight
    const input = ds.resolveInput(ctx);
    if (!input) continue; // can't resolve yet (e.g. chained dependency not cached)
    const snapshotId = await triggerBdSnapshot(ds.datasetId, [input]);
    if (!snapshotId) continue;
    next[ds.key] = { ...entry, pending: { snapshotId, input, at: new Date().toISOString() } };
    changed = true;
  }
  if (!changed) return null;
  await db.update(evaluations).set({ bdAsync: next }).where(eq(evaluations.id, rowId));
  return next;
}

// Post-scoring: queue collections for the subject's datasets (best-effort, non-blocking).
export async function maybeTriggerBdAsync(row: {
  id: string;
  fullName: string | null;
  profile: unknown;
  bdAsync: BdAsync | null;
}): Promise<void> {
  try {
    await queueDatasets(row.id, row.bdAsync ?? {}, rowCtx(row));
  } catch {
    // never fail an eval on enrichment plumbing
  }
}

// Cron sweep: advance pending snapshots. Downloads ready+corroborated ones, caches
// their facts, queues any datasets that became resolvable, and re-scores (capped
// per run; pending cleared only after a successful re-score). The `rescore` callback
// is injected to avoid a bd-async ↔ eval-pipeline import cycle.
export async function sweepBdAsync(opts: {
  rescore: (id: string) => Promise<void>;
  limit?: number;
  maxRescore?: number;
}): Promise<{ checked: number; cached: number; rescored: number }> {
  const limit = opts.limit ?? 20;
  const maxRescore = opts.maxRescore ?? 5;
  const rows = await db
    .select({ id: evaluations.id, fullName: evaluations.fullName, profile: evaluations.profile, bdAsync: evaluations.bdAsync })
    .from(evaluations)
    .where(isNotNull(evaluations.bdAsync))
    .limit(limit);

  let cached = 0;
  let rescored = 0;

  for (const row of rows) {
    const bdAsync: BdAsync = (row.bdAsync as BdAsync) ?? {};
    const pendingKeys = BD_DATASETS.filter((d) => bdAsync[d.key]?.pending && !bdAsync[d.key]?.data);
    if (pendingKeys.length === 0) continue;

    const ctx = rowCtx({ fullName: row.fullName, profile: row.profile, bdAsync });
    let touched = false;
    let newData = false;

    for (const ds of pendingKeys) {
      const p = bdAsync[ds.key]!.pending!;
      const status = await getSnapshotStatus(p.snapshotId);
      if (status === "running" || status === "unknown") {
        if (ageMs(p.at) > STALE_MS) {
          bdAsync[ds.key] = { data: { facts: [], raw: null } }; // give up → terminal empty
          touched = true;
        }
        continue;
      }
      if (status === "failed") {
        bdAsync[ds.key] = { data: { facts: [], raw: null } };
        touched = true;
        continue;
      }
      // ready
      const recs = await downloadBdSnapshot(p.snapshotId);
      const rec = (recs ?? [])[0] as Record<string, unknown> | undefined;
      if (rec && ds.corroborate(rec, ctx)) {
        const facts = ds.facts(rec);
        bdAsync[ds.key] = { data: { facts, raw: rec } };
        touched = true;
        if (facts.length > 0) newData = true;
      } else {
        bdAsync[ds.key] = { data: { facts: [], raw: rec ?? null } }; // corroboration failed → terminal empty
        touched = true;
      }
    }

    if (touched) {
      await db.update(evaluations).set({ bdAsync }).where(eq(evaluations.id, row.id));
      // A newly-cached dataset may unlock a chained one (e.g. company → person).
      await queueDatasets(row.id, bdAsync, rowCtx({ fullName: row.fullName, profile: row.profile, bdAsync }));
    }
    if (newData && rescored < maxRescore) {
      try {
        await opts.rescore(row.id);
        rescored++;
        cached++;
      } catch {
        // leave the cached facts; the next eval/rescore will still pick them up
      }
    }
  }
  return { checked: rows.length, cached, rescored };
}
