-- PERFORMANCE INDEXES (audit quick-win P1-3) — run against prod by hand.
--
-- These back the hottest query paths, which currently do full table scans + sorts:
--   * leaderboard ranking/keyset pagination  (src/lib/leaderboard.ts: ORDER BY
--     score / founder_score / investor_score DESC, id DESC, WHERE hidden_at IS NULL)
--   * the find-email cron draining queued rows (find_email_queued_at IS NOT NULL)
--   * full_name search ILIKE (leaderboard search)
--
-- All use CREATE INDEX CONCURRENTLY so they DON'T lock writes — safe to run on a
-- live DB. CONCURRENTLY cannot run inside a transaction block, so run each
-- statement on its own (psql does this fine when not wrapped in BEGIN/COMMIT):
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/sql/performance-indexes.sql
--
-- NOTE on schema drift: these are managed HERE, not in src/db/schema.ts (see the
-- comment on the evaluations table). Reason: drizzle's `.desc()` emits
-- `DESC NULLS LAST`, but the leaderboard ORDER BY needs the Postgres default
-- `DESC` (NULLS FIRST) for the planner to use the index — so a drizzle-generated
-- migration would describe a DIFFERENT index than these. Keep them in this script
-- and do NOT run `drizzle-kit push` (it compares to the live DB and would try to
-- drop indexes it doesn't know about). `drizzle-kit generate` is unaffected (it
-- never sees them).

-- Combined-score leaderboard (default tab). The partial predicate matches the
-- cheap, high-selectivity part of baseWhere; the planner applies the remaining
-- filters (signal_quality, source, test-prefix) on top.
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_score_keyset_idx
  ON evaluations (score DESC, id DESC)
  WHERE hidden_at IS NULL;

-- Founder tab: ranking is restricted to founder_score > 0.
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_founder_score_keyset_idx
  ON evaluations (founder_score DESC, id DESC)
  WHERE hidden_at IS NULL AND founder_score > 0;

-- Investor tab: ranking is restricted to investor_score > 0.
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_investor_score_keyset_idx
  ON evaluations (investor_score DESC, id DESC)
  WHERE hidden_at IS NULL AND investor_score > 0;

-- find-email cron: only ever scans rows with a non-null queue timestamp.
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_find_email_queued_idx
  ON evaluations (find_email_queued_at)
  WHERE find_email_queued_at IS NOT NULL;

-- Leaderboard name search (ILIKE '%term%'): a trigram GIN index makes the
-- leading-wildcard match index-assisted instead of a full scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_full_name_trgm_idx
  ON evaluations USING gin (full_name gin_trgm_ops);

-- Industry filter (audit P0-2). The leaderboard "Fintech" etc. filter uses an
-- array-overlap predicate (`canonical_industries && ARRAY[...]`, see
-- leaderboard.ts arrayOverlaps), and getIndustryCounts unnests the same column.
-- A GIN index makes the `&&` containment check index-assisted instead of a full
-- table scan per request.
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_canonical_industries_gin_idx
  ON evaluations USING gin (canonical_industries);

-- Percentile baseline + facet scans (audit P0-2). The collapsed
-- computePercentilesAll() (and the credibility/matrix baselines) scan
-- `WHERE signal_quality != 'low' AND source != 'code'` over the whole table on
-- every score render, computing COUNT(*) FILTER over all three score columns in
-- one pass. ~70% of rows are low-signal, so a single PARTIAL COVERING index that
-- bakes the predicate in AND carries all three score columns lets that pass run
-- as an index-only scan over just the in-population rows (no heap access),
-- instead of seq-scanning everything. (A plain (signal_quality, source) btree
-- wouldn't help — both predicates are `!=`, which isn't sargable.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_scored_pop_idx
  ON evaluations (founder_score, investor_score, score)
  WHERE signal_quality != 'low' AND source != 'code';
