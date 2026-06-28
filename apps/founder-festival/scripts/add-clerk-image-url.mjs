// Adds users.clerk_image_url so we can render the LinkedIn profile pic
// (sourced from Clerk's OAuth flow at claim time) on /welcome and
// /leaderboard without re-hitting Clerk's Backend API per render.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const sql = neon(url);

try {
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_image_url" text`;
  console.log("OK — users.clerk_image_url ready");
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
}
