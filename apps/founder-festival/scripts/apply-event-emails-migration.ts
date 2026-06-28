// Apply migration 0060 (event Emails & Texts: message_campaigns + member_messages
// tables + users.pref_*_event_logistics columns) to a target DB. Additive + safe
// + idempotent (CREATE TABLE / ADD COLUMN / CREATE INDEX … IF NOT EXISTS), so it
// can be re-run and never drops or rewrites anything. For prod: --target=prod
//   npx tsx scripts/apply-event-emails-migration.ts --target=prod
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as "dev" | "prod";
const file = target === "prod"
  ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
  : "/Users/drodio/Projects/founder-festival/.env.local";
const env = readFileSync(file, "utf8");
const pick = (k: string) => env.match(new RegExp("^" + k + "=(.*)$", "m"))?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
const url = pick("DATABASE_URL_UNPOOLED") || pick("POSTGRES_URL_NON_POOLING") || pick("DATABASE_URL") || pick("POSTGRES_URL");

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "message_campaigns" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "event_id" uuid REFERENCES "events"("id") ON DELETE set null,
    "created_by_clerk_user_id" text NOT NULL,
    "channel" text DEFAULT 'email' NOT NULL,
    "from_address" text NOT NULL,
    "subject_template" text NOT NULL,
    "body_template" text NOT NULL,
    "signature_text" text,
    "recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "scheduled_for" timestamp with time zone,
    "status" text DEFAULT 'scheduled' NOT NULL,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "member_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "campaign_id" uuid REFERENCES "message_campaigns"("id") ON DELETE set null,
    "clerk_user_id" text,
    "to_evaluation_id" uuid REFERENCES "evaluations"("id") ON DELETE set null,
    "to_email" text NOT NULL,
    "from_address" text NOT NULL,
    "type" text NOT NULL,
    "subject" text NOT NULL,
    "body" text NOT NULL,
    "event_id" uuid REFERENCES "events"("id") ON DELETE set null,
    "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pref_email_event_logistics" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pref_text_event_logistics" boolean DEFAULT true NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "member_messages_user_sent_idx" ON "member_messages" USING btree ("clerk_user_id","sent_at" DESC NULLS LAST)`,
  `CREATE INDEX IF NOT EXISTS "member_messages_eval_sent_idx" ON "member_messages" USING btree ("to_evaluation_id","sent_at" DESC NULLS LAST)`,
  `CREATE INDEX IF NOT EXISTS "member_messages_campaign_idx" ON "member_messages" USING btree ("campaign_id")`,
  `CREATE INDEX IF NOT EXISTS "message_campaigns_event_created_idx" ON "message_campaigns" USING btree ("event_id","created_at" DESC NULLS LAST)`,
  `CREATE INDEX IF NOT EXISTS "message_campaigns_status_scheduled_idx" ON "message_campaigns" USING btree ("status","scheduled_for")`,
];

async function main() {
  const sql = neon(url);
  const host = url.match(/@([^/]+)\//)?.[1] ?? "?";
  console.log(`[${target}] applying to ${host}`);
  for (const stmt of STATEMENTS) await sql.query(stmt);

  // Verify.
  const tbl = await sql.query(
    `SELECT to_regclass('public.message_campaigns') AS c, to_regclass('public.member_messages') AS m`,
  );
  const trow = (Array.isArray(tbl) ? tbl : (tbl as { rows: { c: unknown; m: unknown }[] }).rows)[0];
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('pref_email_event_logistics','pref_text_event_logistics')`,
  );
  const crows = Array.isArray(cols) ? cols : (cols as { rows: unknown[] }).rows;
  console.log(`[${target}] message_campaigns: ${trow.c ? "OK" : "MISSING"} · member_messages: ${trow.m ? "OK" : "MISSING"} · pref cols: ${crows.length}/2`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
