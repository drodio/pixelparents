import { defineConfig } from "drizzle-kit";

// Schema is a directory (one file per domain) so the signup tables and the
// developer API's api_keys table compose without editing a shared file.
export default defineConfig({
  schema: "./lib/db/schema",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
