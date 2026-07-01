import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests cover pure logic only (key crypto, tier gating, validation) — no
// live DB, no Next runtime — so a plain node environment is all we need.
export default defineConfig({
  test: {
    environment: "node",
    // Pure-logic unit tests live next to lib helpers, plus a few pure helpers
    // colocated with route handlers under app/ (e.g. the unsubscribe outcome
    // logic). No live DB / no Next runtime is exercised by these.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror tsconfig "@/*" -> "./*" so test imports match app imports.
      "@": resolve(__dirname, "."),
    },
  },
});
