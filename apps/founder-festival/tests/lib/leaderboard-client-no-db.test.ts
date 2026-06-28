import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regression guard for the 2026-06-01 prod incident: a "use client" component
// (LeaderboardFilters) value-imported STAGE_VALUES/OUTCOME_VALUES from
// "@/lib/leaderboard", which imports "@/db" → neon(process.env.DATABASE_URL!).
// That dragged the DB client into the browser bundle, where DATABASE_URL is
// undefined, so neon() threw at module evaluation and white-screened
// /leaderboard. Client components must import facet constants from the DB-free
// "@/lib/leaderboard-constants" instead.

const root = resolve(__dirname, "../../");
const CLIENT_FILES = [
  "src/components/LeaderboardFilters.tsx",
  "src/components/LeaderboardClient.tsx",
  "src/components/LeaderboardTable.tsx",
];

describe("leaderboard client bundle stays DB-free", () => {
  it("constants module imports without a DATABASE_URL (no @/db dependency)", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("@/lib/leaderboard-constants");
      expect(mod.STAGE_VALUES.length).toBeGreaterThan(0);
      expect(mod.OUTCOME_VALUES).toContain("ipo");
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("no client component value-imports from @/lib/leaderboard", () => {
    for (const rel of CLIENT_FILES) {
      const src = readFileSync(resolve(root, rel), "utf8");
      // Match any import statement whose specifier is exactly "@/lib/leaderboard"
      // (not -constants / -cursor / -badge-sql / -payload).
      const importRe = /import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']@\/lib\/leaderboard["']/g;
      for (const m of src.matchAll(importRe)) {
        const isStatementTypeOnly = Boolean(m[1]); // `import type { ... }`
        const clause = m[2];
        // A brace clause is safe only if EVERY named member is `type`-prefixed.
        const allMembersTypeOnly =
          clause.startsWith("{") &&
          clause
            .replace(/[{}]/g, "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .every((member) => member.startsWith("type "));
        expect(
          isStatementTypeOnly || allMembersTypeOnly,
          `${rel} value-imports from "@/lib/leaderboard" — use "@/lib/leaderboard-constants" for runtime values (pulls @/db into the client bundle)`,
        ).toBe(true);
      }
    }
  });
});
