import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// DB-backed admin allowlist, keyed by email. Composes with the ADMIN_EMAILS
// env var: env entries are the bootstrap superadmins (can't be revoked from the
// UI), rows here are people promoted from the /admin table. A signed-in Clerk
// user is an admin if their (lowercased) primary email is in either set — so
// "designate a submitter as admin" just means inserting their email here, and
// the grant takes effect the moment they sign in to Clerk with that email.
export const admins = pgTable("admins", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
});

export type AdminRow = typeof admins.$inferSelect;
