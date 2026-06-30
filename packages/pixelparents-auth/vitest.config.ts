import { defineConfig } from "vitest/config";

// The SDK is browser-targeted but its logic (PKCE, URL building, token parsing)
// runs fine in node with the Web Crypto global. No DOM is needed for these tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
