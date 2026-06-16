import { defineConfig } from "drizzle-kit";

// Schema is a directory (one file per domain) so this feature's `api_keys` table
// and the in-flight signup tables compose without editing a shared file.
export default defineConfig({
  schema: "./lib/db/schema",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
