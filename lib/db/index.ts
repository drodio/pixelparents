import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Shared Drizzle client over the Neon serverless HTTP driver.
// Tables live in ./schema/*.ts; import them directly where needed.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Surfaced loudly at runtime rather than failing the build.
  console.warn("DATABASE_URL is not set — database calls will fail.");
}

export const db = drizzle(neon(connectionString ?? ""));
