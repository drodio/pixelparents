import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Developer API key requests + keys (one row per request/key). Owns its own
// schema file so it composes with the signup schema via the lib/db/schema/* glob.
//
// Lifecycle: a signed-in Clerk user creates a row with status 'pending' (no key
// yet). An admin approves/rejects it. Only after approval can the user reveal a
// key — at which point we generate it, store its SHA-256 hash + display prefix,
// and show the raw value exactly once. key_hash/key_prefix are therefore null
// until a key is revealed.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Clerk user who owns this request/key (null only for legacy pre-Clerk rows).
  clerkUserId: text("clerk_user_id"),
  // Applicant identity, sourced from the Clerk session at request time.
  name: text("name").notNull(),
  email: text("email").notNull(),
  intendedUse: text("intended_use").notNull(),
  // Approval lifecycle.
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"), // admin email who approved/rejected
  rejectReason: text("reject_reason"),
  // The key itself — null until an approved user reveals one.
  keyHash: text("key_hash").unique(),
  keyPrefix: text("key_prefix"),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  // Retired: one approval gate now, no tiers. Kept for back-compat; unused.
  tier: text("tier"),
  // Legacy column retained so existing rows/migrations don't break.
  label: text("label"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyStatus = "pending" | "approved" | "rejected";
