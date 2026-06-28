/**
 * Apply the audit performance indexes (scripts/sql/performance-indexes.sql) to a
 * DB. Every statement is CREATE INDEX CONCURRENTLY IF NOT EXISTS, so this is
 * idempotent and never locks writes — safe to run on a live DB. neon-http runs
 * each query in autocommit (no wrapping txn), which CONCURRENTLY requires.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/apply-performance-indexes.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/apply-performance-indexes.ts
 *
 * Prints the target host before writing — confirm it's the DB you intend.
 */
import { neon } from "@neondatabase/serverless";

const url =
  process.env.APPLY_DB_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL (set APPLY_DB_URL or load an env file with DOTENV_CONFIG_PATH).");
const sql = neon(url);

// Each entry is one autocommit statement. Mirrors performance-indexes.sql.
const STATEMENTS: string[] = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_score_keyset_idx ON evaluations (score DESC, id DESC) WHERE hidden_at IS NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_founder_score_keyset_idx ON evaluations (founder_score DESC, id DESC) WHERE hidden_at IS NULL AND founder_score > 0`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_investor_score_keyset_idx ON evaluations (investor_score DESC, id DESC) WHERE hidden_at IS NULL AND investor_score > 0`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_find_email_queued_idx ON evaluations (find_email_queued_at) WHERE find_email_queued_at IS NOT NULL`,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_full_name_trgm_idx ON evaluations USING gin (full_name gin_trgm_ops)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_canonical_industries_gin_idx ON evaluations USING gin (canonical_industries)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS evaluations_scored_pop_idx ON evaluations (founder_score, investor_score, score) WHERE signal_quality != 'low' AND source != 'code'`,
];

async function main() {
  console.log(`Applying ${STATEMENTS.length} performance indexes to host: ${new URL(url!).host}`);
  for (const stmt of STATEMENTS) {
    const name = stmt.match(/(?:INDEX|EXTENSION)(?:\s+CONCURRENTLY)?(?:\s+IF NOT EXISTS)?\s+(\S+)/i)?.[1] ?? stmt.slice(0, 40);
    process.stdout.write(`  • ${name} … `);
    await sql.query(stmt);
    console.log("ok");
  }
  console.log("Done.");
}
main().catch((e) => { console.error("\nFAILED:", e.message); process.exit(1); });
