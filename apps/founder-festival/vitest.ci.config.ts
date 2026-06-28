import { defineConfig, mergeConfig, configDefaults } from "vitest/config";
import base from "./vitest.config";

// CI GATE config — the BLOCKING test job uses this (the default vitest.config.ts
// is what you run locally). It:
//  - resets volatile counters once before the run (tests/global-setup.ts), so the
//    persistent Neon test branch's accumulating rate_limit state can't flake tests;
//  - EXCLUDES suites that aren't yet data-isolated, so the gate is reliably green.
//
// The excluded suites assume a clean/specific DB state (they query "all rows" and
// assert counts/ordering against whatever the branch happens to contain) or hit an
// external API. Run sequentially (--no-file-parallelism) in CI to avoid cross-file
// races. Re-include each file here as it gets per-test isolation (transaction
// rollback or test-scoped row namespacing) — see docs/REFACTOR-SECURITY-AUDIT.md
// (reliability / test-gaps).
const NOT_YET_ISOLATED = [
  "tests/app/rescore-all.test.ts",
  "tests/lib/eval-pipeline.test.ts",
  "tests/lib/select-top-profiles.test.ts",
  "tests/lib/profiles-scored.test.ts",
  "tests/lib/hn-tokenmaxxing-enricher.test.ts", // external API (tkmx.odio.dev)
];

export default mergeConfig(
  base,
  defineConfig({
    test: {
      globalSetup: ["./tests/global-setup.ts"],
      exclude: [...configDefaults.exclude, ...NOT_YET_ISOLATED],
    },
  }),
);
