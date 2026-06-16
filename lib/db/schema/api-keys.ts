import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Developer API keys. Owns its own schema file so this feature composes with the
// in-flight signup schema (signups / children) without two agents editing the
// same file. drizzle-kit picks it up via the `lib/db/schema/*` glob.
//
// We store only the SHA-256 hash of the raw key — the raw value is shown to the
// requester exactly once at issuance and never persisted.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label"),
  // Requester identity — so DROdio knows who to approve and can reach them.
  name: text("name").notNull(),
  email: text("email").notNull(),
  intendedUse: text("intended_use").notNull(),
  // 'public' (self-serve, abstract aggregates) | 'approved' (richer non-PII).
  tier: text("tier").notNull().default("public"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type ApiKeyRow = typeof apiKeys.$inferSelect;
