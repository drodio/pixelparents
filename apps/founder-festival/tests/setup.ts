import { config } from "dotenv";
config({ path: ".env.local" });

// Allow pointing DB-writing tests at a separate Neon test branch.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Surfaced so DB-writing test files (tests/app/*.test.ts) can self-skip when
// DATABASE_URL still points at the production Neon host. Pure-function tests
// in tests/lib/ are not affected.
//
// Background: tests/app/events-apply.test.ts and tests/app/scoring-tick-events.test.ts
// insert evaluations + event_applicants directly. With .env.local pointing at
// prod, those rows show up on festival.so's leaderboard ("T", "Auto Founder",
// etc.). Until a Neon test branch is configured, those suites must skip.
const PROD_HOST_FRAGMENT = "ep-fragrant-surf-aqyi9p6w";
export const IS_PROD_DB =
  (process.env.DATABASE_URL ?? "").includes(PROD_HOST_FRAGMENT) &&
  !process.env.ALLOW_TESTS_ON_PROD_DB;

if (IS_PROD_DB) {
  console.warn(
    "[tests/setup] WARN: DATABASE_URL points at the production Neon host. " +
    "DB-writing suites in tests/app/ will be skipped. To run them, create a " +
    "Neon test branch and set TEST_DATABASE_URL.",
  );
}
