import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests cover pure logic only (key crypto, tier gating, validation) — no
// live DB, no Next runtime — so a plain node environment is all we need.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirror tsconfig "@/*" -> "./*" so test imports match app imports.
      "@": resolve(__dirname, "."),
    },
  },
});
