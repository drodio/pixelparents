import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

// One-time backfill: trust every existing medium (LinkedIn name-only) claim as
// accurate and upgrade it to high (owner-grade), so those users stay "claimed"
// when the app flips to high-only. NEW name-only claims are unaffected — they
// land as medium and use the verify-to-own banner.
//
// We keep verified_signal = 'linkedin-name-match' so a grandfathered row is
// self-identifying (match_confidence='high' AND verified_signal='linkedin-name-match'),
// and the claim/callback never-downgrade guard keeps it high on re-auth.
//
// Run with `dev` or `prod`:
//   npx tsx scripts/grandfather-medium-claims.ts dev
//   npx tsx scripts/grandfather-medium-claims.ts prod
config({ path: ".env.local", quiet: true });

const target = process.argv[2];
if (target !== "dev" && target !== "prod") {
  throw new Error("usage: grandfather-medium-claims.ts <dev|prod>");
}
const conn = target === "prod" ? process.env.POSTGRES_URL_NON_POOLING : process.env.DATABASE_URL;
if (!conn) throw new Error(`no connection string for ${target}`);
// Host guards: a prod run MUST hit the prod branch; a dev run must NOT.
if (target === "prod" && !/ep-fragrant-surf/.test(conn)) {
  throw new Error("prod target but connection is not the prod host");
}
if (target === "dev" && /ep-fragrant-surf/.test(conn)) {
  throw new Error("dev target but connection IS the prod host");
}

const sql = neon(conn);

const run = async () => {
  const before = await sql`
    SELECT match_confidence AS conf, COUNT(*)::int AS n
    FROM users WHERE evaluation_id IS NOT NULL GROUP BY 1 ORDER BY n DESC`;
  console.log("before:", JSON.stringify(before));

  const updated = await sql`
    UPDATE users SET match_confidence = 'high'
    WHERE match_confidence = 'medium'
    RETURNING clerk_user_id`;
  console.log(`grandfathered ${updated.length} medium claim(s) -> high`);

  const after = await sql`
    SELECT match_confidence AS conf, COUNT(*)::int AS n
    FROM users WHERE evaluation_id IS NOT NULL GROUP BY 1 ORDER BY n DESC`;
  console.log("after:", JSON.stringify(after));
};

run().then(() => process.exit(0));
